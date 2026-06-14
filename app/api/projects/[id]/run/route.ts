import OpenAI from "openai";

import { buildFallbackResponse } from "@/lib/sample-data";
import {
  getProject,
  insertAgentEvent,
  insertEvidence,
  resetProjectRows,
  updateProjectStatus,
  updateRowStatus,
  upsertCellEval,
  upsertDataPr,
} from "@/lib/project-store";
import {
  agentNameByRole,
  type AgentEvent,
  type AgentRole,
  type CompanyRecord,
  type DataPR,
  type FieldEval,
  type GridFieldKey,
  type Project,
} from "@/lib/schemas";
import {
  ingestionAgent,
  sourceHunterAgent,
  identityResolverAgent,
  contradictionAnalystAgent,
  trustScorerAgent,
  dataPrWriterAgent,
} from "@/lib/agents";

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

type StreamState = {
  closed: boolean;
};

function eventId() {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function write(
  controller: ReadableStreamDefaultController<Uint8Array>,
  state: StreamState,
  projectId: string,
  event: Omit<AgentEvent, "id" | "timestamp" | "runId"> & { fieldKey?: GridFieldKey },
) {
  if (state.closed) return;

  const { fieldKey, ...rest } = event;
  const payload: AgentEvent = {
    id: eventId(),
    runId: projectId,
    timestamp: new Date().toISOString(),
    ...rest,
  };
  await insertAgentEvent(projectId, event.companyId, payload, fieldKey);
  if (state.closed) return;

  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  } catch (error) {
    state.closed = true;
    if (!(error instanceof Error && /closed/i.test(error.message))) {
      throw error;
    }
  }
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

async function emitCompany(
  controller: ReadableStreamDefaultController<Uint8Array>,
  state: StreamState,
  projectId: string,
  rowId: string,
  record: CompanyRecord,
  index: number,
  mode: "live" | "fallback",
) {
  await updateRowStatus(projectId, rowId, "running", 5);
  await write(controller, state, projectId, {
    type: "company_started",
    mode,
    companyId: rowId,
    company: record.company_name,
    message: `Starting evaluation pipeline for ${record.company_name}.`,
    progress: 3,
  });

  // Shared state passed between agents
  let pr = fallbackPrFor(record);
  let activeMode = mode;

  // ─── Agent 1: Ingestion ─────────────────────────────────────────────────────
  {
    const agent: AgentRole = "ingestion";
    const agentResult = ingestionAgent(record);
    await write(controller, state, projectId, {
      type: "agent_started",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.thinkingMessage,
      thinking: agentResult.thinkingMessage,
      progress: 10,
    });
    await updateRowStatus(projectId, rowId, "running", 10);
    await delay(250 + index * 60);
    await write(controller, state, projectId, {
      type: "agent_log",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.completionMessage,
      progress: 14,
    });
  }

  if (state.closed) return pr;

  // ─── Agent 2: Source Hunter (real LLM call with web_search) ─────────────────
  {
    const agent: AgentRole = "source_hunter";
    await write(controller, state, projectId, {
      type: "agent_started",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: `Searching public sources for ${record.company_name} (website, LinkedIn, news, filings)…`,
      thinking: `Searching public sources for ${record.company_name}…`,
      progress: 18,
    });
    await updateRowStatus(projectId, rowId, "running", 18);

    if (process.env.OPENAI_API_KEY) {
      try {
        const result = await sourceHunterAgent(record);
        pr = result.pr;
        await write(controller, state, projectId, {
          type: "agent_log",
          mode: activeMode,
          companyId: rowId,
          company: record.company_name,
          agent,
          message: result.thinkingMessage,
          progress: 35,
        });
      } catch (error) {
        activeMode = "fallback";
        pr = fallbackPrFor(record);
        console.error(`Source Hunter failed for ${record.company_name}; using fallback.`, error);
        await write(controller, state, projectId, {
          type: "agent_log",
          mode: activeMode,
          companyId: rowId,
          company: record.company_name,
          agent,
          message: `Used cached data for ${record.company_name} (live search unavailable).`,
          progress: 35,
        });
      }
    } else {
      await delay(400 + index * 80);
      await write(controller, state, projectId, {
        type: "agent_log",
        mode: activeMode,
        companyId: rowId,
        company: record.company_name,
        agent,
        message: `Found ${pr.sources.length} cached sources for ${record.company_name}.`,
        progress: 35,
      });
    }

    // Emit evidence events
    for (const source of pr.sources.slice(0, 3)) {
      if (state.closed) return pr;
      await delay(80);
      await insertEvidence(projectId, rowId, "website", source);
      await write(controller, state, projectId, {
        type: "evidence_found",
        mode: activeMode,
        companyId: rowId,
        company: record.company_name,
        agent,
        evidence: source,
        fieldKey: "website",
        message: `Source found: ${source.title}`,
        progress: 38,
      });
    }
  }

  if (state.closed) return pr;

  // ─── Agent 3: Identity Resolver ─────────────────────────────────────────────
  {
    const agent: AgentRole = "identity_resolver";
    const agentResult = identityResolverAgent(record, pr);
    await write(controller, state, projectId, {
      type: "agent_started",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.thinkingMessage,
      thinking: agentResult.thinkingMessage,
      progress: 46,
    });
    await updateRowStatus(projectId, rowId, "running", 46);
    await delay(200 + index * 40);
    await write(controller, state, projectId, {
      type: "agent_log",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.completionMessage,
      progress: 52,
    });
  }

  if (state.closed) return pr;

  // ─── Agent 4: Contradiction Analyst ─────────────────────────────────────────
  {
    const agent: AgentRole = "contradiction_analyst";
    const agentResult = contradictionAnalystAgent(record, pr);
    await write(controller, state, projectId, {
      type: "agent_started",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.thinkingMessage,
      thinking: agentResult.thinkingMessage,
      progress: 58,
    });
    await updateRowStatus(projectId, rowId, "running", 58);
    await delay(220 + index * 40);
    await write(controller, state, projectId, {
      type: "agent_log",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.completionMessage,
      progress: 65,
    });
  }

  if (state.closed) return pr;

  // ─── Agent 5: Trust Scorer ───────────────────────────────────────────────────
  {
    const agent: AgentRole = "trust_scorer";
    const agentResult = trustScorerAgent(record, pr);
    await write(controller, state, projectId, {
      type: "agent_started",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.thinkingMessage,
      thinking: agentResult.thinkingMessage,
      progress: 70,
    });
    await updateRowStatus(projectId, rowId, "running", 70);

    // Emit per-field updates
    for (const field of pr.fieldReviews) {
      if (state.closed) return pr;
      await delay(70);
      const cell = await upsertCellEval(projectId, rowId, field);
      for (const source of field.evidence) {
        await insertEvidence(projectId, rowId, cell.fieldKey, source);
      }
      await write(controller, state, projectId, {
        type: "field_update",
        mode: activeMode,
        companyId: rowId,
        company: record.company_name,
        agent,
        field: field as FieldEval,
        fieldKey: cell.fieldKey,
        message: `"${field.field.replaceAll("_", " ")}" scored ${field.trustScore}% — ${field.rationale.slice(0, 60)}…`,
        progress: 76,
      });
    }

    await write(controller, state, projectId, {
      type: "agent_log",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.completionMessage,
      progress: 82,
    });
  }

  if (state.closed) return pr;

  // ─── Agent 6: Data PR Writer ─────────────────────────────────────────────────
  {
    const agent: AgentRole = "data_pr_writer";
    const agentResult = dataPrWriterAgent(record, pr);
    await write(controller, state, projectId, {
      type: "agent_started",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.thinkingMessage,
      thinking: agentResult.thinkingMessage,
      progress: 88,
    });
    await updateRowStatus(projectId, rowId, "running", 88);
    await delay(180 + index * 30);

    await upsertDataPr(projectId, rowId, pr);
    await updateRowStatus(projectId, rowId, "completed", 100);

    await write(controller, state, projectId, {
      type: "agent_log",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent,
      message: agentResult.completionMessage,
      progress: 95,
    });

    await write(controller, state, projectId, {
      type: "data_pr_created",
      mode: activeMode,
      companyId: rowId,
      company: record.company_name,
      agent: "data_pr_writer",
      pr,
      message: `Data PR ready for ${record.company_name}.`,
      progress: 100,
    });
  }

  await write(controller, state, projectId, {
    type: "company_completed",
    mode: activeMode,
    companyId: rowId,
    company: record.company_name,
    message: `${record.company_name} pipeline complete.`,
    progress: 100,
  });

  return pr;
}

export async function POST(_request: Request, context: RouteContext<"/api/projects/[id]/run">) {
  const { id } = await context.params;
  const body = (await _request.json().catch(() => ({}))) as { rowId?: unknown };
  const requestedRowId = typeof body.rowId === "string" ? body.rowId : undefined;
  const isProjectRun = !requestedRowId;
  const project = await getProject(id);

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const targetRows = requestedRowId ? project.rows.filter((row) => row.id === requestedRowId) : project.rows;
  if (requestedRowId && !targetRows.length) {
    return Response.json({ error: "Row not found" }, { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const mode = process.env.OPENAI_API_KEY ? "live" : "fallback";
      const prs: DataPR[] = [];
      const state: StreamState = { closed: false };

      try {
        await resetProjectRows(id, targetRows.map((row) => row.id));
        if (isProjectRun) {
          await updateProjectStatus(id, "running");
        }
        await write(controller, state, id, {
          type: "run_started",
          mode,
          message: `TrustLayer agent pipeline started — ${targetRows.length} row${targetRows.length === 1 ? "" : "s"} queued.`,
          progress: 0,
        });

        for (const [index, row] of targetRows.entries()) {
          prs.push(await emitCompany(controller, state, id, row.id, row.record, index, mode));
          if (state.closed) return;
        }

        const summary = summarize(prs);
        if (isProjectRun) {
          await updateProjectStatus(id, "completed");
        }
        await write(controller, state, id, {
          type: "run_completed",
          mode,
          message: `All ${targetRows.length} row${targetRows.length === 1 ? "" : "s"} evaluated.`,
          summary,
          progress: 100,
        });
      } catch (error) {
        console.error("TrustLayer project run failed.", error);
        if (isProjectRun) {
          await updateProjectStatus(id, "failed" as Project["status"]);
        }
        await write(controller, state, id, {
          type: "run_failed",
          mode: "fallback",
          message: "Pipeline run failed. Check that company_name is present in all rows.",
          progress: 100,
        });
      } finally {
        state.closed = true;
        try {
          controller.close();
        } catch {
          // Ignore double-close when client disconnects mid-run.
        }
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
