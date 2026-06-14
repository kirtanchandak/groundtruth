import OpenAI from "openai";

import { buildFallbackResponse } from "@/lib/sample-data";
import {
  agentNameByRole,
  EvaluateRequestSchema,
  EvaluateResponseSchema,
  evaluateResponseJsonSchema,
  type AgentEvent,
  type AgentRole,
  type CompanyRecord,
  type DataPR,
  type EvaluateResponse,
  type FieldEval,
} from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

const agentSequence: AgentRole[] = [
  "ingestion",
  "source_hunter",
  "identity_resolver",
  "contradiction_analyst",
  "trust_scorer",
  "data_pr_writer",
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function eventId() {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function write(controller: ReadableStreamDefaultController<Uint8Array>, event: Omit<AgentEvent, "id" | "timestamp">) {
  const payload: AgentEvent = {
    id: eventId(),
    timestamp: new Date().toISOString(),
    ...event,
  };

  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function summarize(prs: DataPR[]): EvaluateResponse["summary"] {
  const scores = prs.flatMap((pr) => pr.fieldReviews.map((field) => field.trustScore));

  return {
    totalRecords: prs.length,
    proposedUpdates: prs.filter((pr) => pr.decision === "approve_update").length,
    escalations: prs.filter((pr) => pr.decision === "escalate_human" || pr.decision === "contact_company").length,
    accepted: prs.filter((pr) => pr.decision === "accept_current").length,
    averageTrust: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
  };
}

function buildAgentMessage(agent: AgentRole, company: string, pr: DataPR) {
  const lowestTrust = [...pr.fieldReviews].sort((a, b) => a.trustScore - b.trustScore)[0];
  const flaggedFields = pr.fieldReviews.filter((f) => f.contradictions.length > 0);

  const messages: Record<AgentRole, string> = {
    ingestion: `Mapped ${pr.fieldReviews.length} fields for ${company} — queued for evidence collection.`,
    source_hunter: `Found ${pr.sources.length} public source${pr.sources.length !== 1 ? "s" : ""} for ${company}.`,
    identity_resolver: pr.website
      ? `Identity confirmed — matched ${company} to ${pr.website}.`
      : `Identity resolved with available public data for ${company}.`,
    contradiction_analyst: flaggedFields.length > 0
      ? `Flagged ${flaggedFields.length} field${flaggedFields.length !== 1 ? "s" : ""} with contradictions: ${flaggedFields.map((f) => f.field.replaceAll("_", " ")).join(", ")}.`
      : `No contradictions found — CRM data aligns with public evidence for ${company}.`,
    trust_scorer: lowestTrust
      ? `Avg trust scored — weakest field: "${lowestTrust.field.replaceAll("_", " ")}" at ${lowestTrust.trustScore}%.`
      : `Trust scoring complete for ${company}.`,
    data_pr_writer: `Data PR drafted — decision: ${pr.decision.replaceAll("_", " ")}. ${pr.patchPreview.length > 0 ? `${pr.patchPreview.length} patch${pr.patchPreview.length !== 1 ? "es" : ""} proposed.` : "No changes recommended."}`,
  };

  return messages[agent];
}

async function evaluateCompanyLive(row: CompanyRecord): Promise<DataPR> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const systemPrompt = [
    "You are the Source Hunter agent inside TrustLayer, an autonomous B2B data steward.",
    "Your ONLY job: search the web and find authoritative public evidence for the supplied company.",
    "Search for: official company website, LinkedIn profile, Crunchbase/funding data, recent news.",
    "Verify headcount, HQ location, total funding raised, industry vertical, website, and LinkedIn URL.",
    "Return a single precise DataPR. Be specific — cite exact numbers you found.",
    "Flag conflicts between CRM data and web evidence in contradictions.",
    "Decision: approve_update if evidence clearly differs; accept_current if aligned; escalate_human if ambiguous; contact_company if no public data.",
  ].join("\n");

  const response = await client.responses.create(
    {
      model,
      instructions: systemPrompt,
      input: [
        "Evaluate this B2B account record:",
        JSON.stringify([row], null, 2),
        "",
        "Search the web, gather evidence, and return a complete DataPR with fieldReviews and sources.",
      ].join("\n"),
      text: {
        format: {
          type: "json_schema",
          name: "trustlayer_source_hunter_eval",
          strict: true,
          schema: evaluateResponseJsonSchema,
        },
      },
      tools: [{ type: "web_search" }],
    },
    { timeout: 50000 },
  );

  const parsed = EvaluateResponseSchema.omit({ runId: true, mode: true }).parse(JSON.parse(response.output_text));
  const pr = parsed.prs[0];

  if (!pr) {
    throw new Error("Source Hunter returned no Data PR.");
  }

  return pr;
}

function fallbackPrFor(row: CompanyRecord) {
  return buildFallbackResponse([row]).prs[0];
}

async function emitCompany(
  controller: ReadableStreamDefaultController<Uint8Array>,
  runId: string,
  row: CompanyRecord,
  index: number,
  mode: "live" | "fallback",
  forceDemo: boolean,
) {
  write(controller, {
    type: "company_started",
    runId,
    mode,
    companyId: row.id,
    company: row.company_name,
    message: `Started eval for ${row.company_name}.`,
    progress: 3,
  });

  let pr = fallbackPrFor(row);
  let liveFailed = false;

  for (const [agentIndex, agent] of agentSequence.entries()) {
    write(controller, {
      type: "agent_started",
      runId,
      mode,
      companyId: row.id,
      company: row.company_name,
      agent,
      message: `${agentNameByRole[agent]} started.`,
      progress: Math.min(12 + agentIndex * 14, 92),
    });
    await delay(190 + index * 40);

    if (agent === "source_hunter" && process.env.OPENAI_API_KEY && !forceDemo) {
      try {
        pr = await evaluateCompanyLive(row);
      } catch (error) {
        liveFailed = true;
        console.error(`GroundTruth live stream eval failed for ${row.company_name}; using fallback.`, error);
        pr = fallbackPrFor(row);
      }
    }

    write(controller, {
      type: "agent_log",
      runId,
      mode: liveFailed ? "fallback" : mode,
      companyId: row.id,
      company: row.company_name,
      agent,
      message: buildAgentMessage(agent, row.company_name, pr),
      progress: Math.min(18 + agentIndex * 14, 96),
    });

    if (agent === "source_hunter") {
      for (const source of pr.sources.slice(0, 2)) {
        await delay(120);
        write(controller, {
          type: "evidence_found",
          runId,
          mode: liveFailed ? "fallback" : mode,
          companyId: row.id,
          company: row.company_name,
          agent,
          evidence: source,
          message: `Evidence found: ${source.title}`,
          progress: 35,
        });
      }
    }

    if (agent === "trust_scorer") {
      for (const field of pr.fieldReviews.slice(0, 4)) {
        await delay(90);
        write(controller, {
          type: "field_update",
          runId,
          mode: liveFailed ? "fallback" : mode,
          companyId: row.id,
          company: row.company_name,
          agent,
          field: field as FieldEval,
          message: `${field.field.replaceAll("_", " ")} trust scored at ${field.trustScore}%.`,
          progress: 74,
        });
      }
    }
  }

  write(controller, {
    type: "data_pr_created",
    runId,
    mode: liveFailed ? "fallback" : mode,
    companyId: row.id,
    company: row.company_name,
    agent: "data_pr_writer",
    pr,
    message: `Data PR created for ${row.company_name}.`,
    progress: 100,
  });

  write(controller, {
    type: "company_completed",
    runId,
    mode: liveFailed ? "fallback" : mode,
    companyId: row.id,
    company: row.company_name,
    message: `${row.company_name} eval completed.`,
    progress: 100,
  });

  return pr;
}

export async function POST(request: Request) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const runId = `run-${Date.now()}`;

      try {
        const body = await request.json();
        const parsed = EvaluateRequestSchema.parse(body);
        const mode = process.env.OPENAI_API_KEY && !parsed.forceDemo ? "live" : "fallback";

        write(controller, {
          type: "run_started",
          runId,
          mode,
          message: `GroundTruth started ${mode} agent evaluation for ${parsed.rows.length} records.`,
          progress: 0,
        });

        const prs: DataPR[] = [];
        for (const [index, row] of parsed.rows.entries()) {
          const pr = await emitCompany(controller, runId, row, index, mode, parsed.forceDemo);
          prs.push(pr);
        }

        write(controller, {
          type: "run_completed",
          runId,
          mode,
          message: "All agent evals completed.",
          summary: summarize(prs),
          progress: 100,
        });
      } catch (error) {
        console.error("GroundTruth stream failed.", error);
        write(controller, {
          type: "run_failed",
          runId,
          mode: "fallback",
          message: "GroundTruth could not evaluate this CSV. Check that company_name is present.",
          progress: 100,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
