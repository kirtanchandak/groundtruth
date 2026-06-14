import OpenAI from "openai";

import { buildFallbackResponse } from "@/lib/sample-data";
import {
  getProject,
  insertAgentEvent,
  insertEvidence,
  updateProjectStatus,
  updateRowStatus,
  upsertCellEval,
  upsertDataPr,
} from "@/lib/project-store";
import {
  agentNameByRole,
  EvaluateResponseSchema,
  evaluateResponseJsonSchema,
  type AgentEvent,
  type AgentRole,
  type CompanyRecord,
  type DataPR,
  type FieldEval,
  type GridFieldKey,
  type Project,
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

async function write(
  controller: ReadableStreamDefaultController<Uint8Array>,
  projectId: string,
  event: Omit<AgentEvent, "id" | "timestamp" | "runId"> & { fieldKey?: GridFieldKey },
) {
  const { fieldKey, ...rest } = event;
  const payload: AgentEvent = {
    id: eventId(),
    runId: projectId,
    timestamp: new Date().toISOString(),
    ...rest,
  };
  await insertAgentEvent(projectId, event.companyId, payload, fieldKey);
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function fallbackPrFor(record: CompanyRecord) {
  return buildFallbackResponse([record]).prs[0];
}

function summarize(prs: DataPR[]) {
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
  const contradiction = pr.fieldReviews.find((field) => field.contradictions.length);

  const messages: Record<AgentRole, string> = {
    ingestion: `Mapped ${company} into the project grid and queued field cells.`,
    source_hunter: `Found ${pr.sources.length} usable public sources for ${company}.`,
    identity_resolver: `Matched ${company} to ${pr.website || "the supplied website/profile"}.`,
    contradiction_analyst: contradiction
      ? `Flagged contradiction on ${contradiction.field.replaceAll("_", " ")}.`
      : `No blocking contradictions found for ${company}.`,
    trust_scorer: lowestTrust
      ? `Lowest trust field is ${lowestTrust.field.replaceAll("_", " ")} at ${lowestTrust.trustScore}%.`
      : `Scored available evidence for ${company}.`,
    data_pr_writer: `Drafted Data PR: ${pr.recommendedAction}`,
  };

  return messages[agent];
}

async function evaluateCompanyLive(record: CompanyRecord): Promise<DataPR> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? "gpt-5.5";

  const response = await client.responses.create(
    {
      model,
      input: [
        "You are GroundTruth, an autonomous RevOps data steward.",
        "Evaluate exactly one enterprise account record using web evidence.",
        "Return exactly one Data PR inside the prs array.",
        "Verify headcount, HQ, funding, industry, website, LinkedIn/company profile, and segment/routing impact.",
        JSON.stringify([record], null, 2),
      ].join("\n"),
      reasoning: { effort: "medium" },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "groundtruth_project_company_eval",
          strict: true,
          schema: evaluateResponseJsonSchema,
        },
      },
      tools: [{ type: "web_search" }],
    },
    { timeout: 45000 },
  );

  const parsed = EvaluateResponseSchema.omit({ runId: true, mode: true }).parse(JSON.parse(response.output_text));
  const pr = parsed.prs[0];
  if (!pr) throw new Error("No Data PR returned.");
  return pr;
}

async function emitCompany(
  controller: ReadableStreamDefaultController<Uint8Array>,
  projectId: string,
  rowId: string,
  record: CompanyRecord,
  index: number,
  mode: "live" | "fallback",
) {
  await updateRowStatus(projectId, rowId, "running", 5);
  await write(controller, projectId, {
    type: "company_started",
    mode,
    companyId: rowId,
    company: record.company_name,
    message: `${record.company_name} row started.`,
    progress: 5,
  });

  let pr = fallbackPrFor(record);
  let activeMode = mode;

  for (const [agentIndex, agent] of agentSequence.entries()) {
    const progress = Math.min(12 + agentIndex * 14, 92);
    await write(controller, projectId, {
      type: "agent_started",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: `${agentNameByRole[agent]} started.`,
      progress,
    });
    await updateRowStatus(projectId, rowId, "running", progress);
    await delay(160 + index * 35);

    if (agent === "source_hunter" && process.env.OPENAI_API_KEY) {
      try {
        pr = await evaluateCompanyLive(record);
      } catch (error) {
        activeMode = "fallback";
        pr = fallbackPrFor(record);
        console.error(`GroundTruth live project eval failed for ${record.company_name}; using fallback.`, error);
      }
    }

    await write(controller, projectId, {
      type: "agent_log",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: buildAgentMessage(agent, record.company_name, pr),
      progress,
    });

    if (agent === "source_hunter") {
      for (const source of pr.sources.slice(0, 2)) {
        await delay(80);
        await insertEvidence(projectId, rowId, "website", source);
        await write(controller, projectId, {
          type: "evidence_found",
          mode: activeMode,
          companyId: rowId,
          company: record.company_name,
          agent,
          evidence: source,
          fieldKey: "website",
          message: `Evidence found: ${source.title}`,
          progress: 35,
        });
      }
    }

    if (agent === "trust_scorer") {
      for (const field of pr.fieldReviews) {
        await delay(70);
        const cell = await upsertCellEval(projectId, rowId, field);
        for (const source of field.evidence) {
          await insertEvidence(projectId, rowId, cell.fieldKey, source);
        }
        await write(controller, projectId, {
          type: "field_update",
          mode: activeMode,
          companyId: rowId,
          company: record.company_name,
          agent,
          field: field as FieldEval,
          fieldKey: cell.fieldKey,
          message: `${field.field.replaceAll("_", " ")} cell scored at ${field.trustScore}%.`,
          progress: 76,
        });
      }
    }
  }

  await upsertDataPr(projectId, rowId, pr);
  await updateRowStatus(projectId, rowId, "completed", 100);
  await write(controller, projectId, {
    type: "data_pr_created",
    mode: activeMode,
    companyId: rowId,
    company: record.company_name,
    agent: "data_pr_writer",
    pr,
    message: `Data PR created for ${record.company_name}.`,
    progress: 100,
  });
  await write(controller, projectId, {
    type: "company_completed",
    mode: activeMode,
    companyId: rowId,
    company: record.company_name,
    message: `${record.company_name} completed.`,
    progress: 100,
  });

  return pr;
}

export async function POST(_request: Request, context: RouteContext<"/api/projects/[id]/run">) {
  const { id } = await context.params;
  const project = await getProject(id);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const mode = process.env.OPENAI_API_KEY ? "live" : "fallback";
      const prs: DataPR[] = [];

      try {
        await updateProjectStatus(id, "running");
        await write(controller, id, {
          type: "run_started",
          mode,
          message: `Project run started for ${project.rows.length} rows.`,
          progress: 0,
        });

        for (const [index, row] of project.rows.entries()) {
          prs.push(await emitCompany(controller, id, row.id, row.record, index, mode));
        }

        const summary = summarize(prs);
        await updateProjectStatus(id, "completed");
        await write(controller, id, {
          type: "run_completed",
          mode,
          message: "Project run completed.",
          summary,
          progress: 100,
        });
      } catch (error) {
        console.error("GroundTruth project run failed.", error);
        await updateProjectStatus(id, "failed" as Project["status"]);
        await write(controller, id, {
          type: "run_failed",
          mode: "fallback",
          message: "Project run failed.",
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
