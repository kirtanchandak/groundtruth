import OpenAI from "openai";

import { buildFallbackResponse } from "@/lib/sample-data";
import {
  EvaluateRequestSchema,
  EvaluateResponseSchema,
  evaluateResponseJsonSchema,
  type CompanyRecord,
  type EvaluateResponse,
} from "@/lib/schemas";

export const runtime = "nodejs";

function withRunId(result: Omit<EvaluateResponse, "runId" | "mode">, mode: "live" | "fallback"): EvaluateResponse {
  return {
    runId: `${mode}-${Date.now()}`,
    mode,
    ...result,
  };
}

function buildPrompt(rows: CompanyRecord[]) {
  return [
    "You are GroundTruth, an autonomous RevOps data steward.",
    "Evaluate uploaded enterprise account records using web evidence.",
    "For each company, verify headcount, HQ, funding, industry, website, LinkedIn/company profile, and segment/routing impact.",
    "Make one concrete decision per record: accept_current, approve_update, escalate_human, or contact_company.",
    "Only make claims supported by cited public sources. Keep rationale concise.",
    "Prefer changing CRM data only when evidence is strong. Contradictory evidence should usually escalate_human.",
    "Return JSON that exactly matches the schema.",
    "",
    "Company records:",
    JSON.stringify(rows, null, 2),
  ].join("\n");
}

async function evaluateLive(rows: CompanyRecord[]) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? "gpt-5.5";

  const response = await client.responses.create(
    {
      model,
      input: buildPrompt(rows),
      reasoning: { effort: "medium" },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "groundtruth_enterprise_data_eval",
          strict: true,
          schema: evaluateResponseJsonSchema,
        },
      },
      tools: [{ type: "web_search" }],
    },
    { timeout: 45000 },
  );

  const raw = response.output_text;
  const parsed = JSON.parse(raw);
  return withRunId(EvaluateResponseSchema.omit({ runId: true, mode: true }).parse(parsed), "live");
}

export async function POST(request: Request) {
  let rows: CompanyRecord[] = [];

  try {
    const body = await request.json();
    const parsed = EvaluateRequestSchema.parse(body);
    rows = parsed.rows;

    if (!process.env.OPENAI_API_KEY || parsed.forceDemo) {
      return Response.json(buildFallbackResponse(rows));
    }

    try {
      return Response.json(await evaluateLive(rows));
    } catch (error) {
      console.error("GroundTruth live eval failed; using fallback.", error);
      return Response.json(buildFallbackResponse(rows));
    }
  } catch (error) {
    console.error("GroundTruth request validation failed.", error);
    return Response.json(
      {
        error: "Invalid CSV payload",
        detail: "Upload at least one company record with a company_name column.",
      },
      { status: 400 },
    );
  }
}
