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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type StreamState = {
  closed: boolean;
};

function logRun(projectId: string, message: string, details?: Record<string, unknown>) {
  const prefix = `[GroundTruth:${projectId}]`;
  if (details) {
    console.info(new Date().toISOString(), prefix, message, details);
    return;
  }
  console.info(new Date().toISOString(), prefix, message);
}

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
  logRun(projectId, "Row started", {
    company: record.company_name,
    rowId,
    position: index + 1,
    mode,
  });
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
    logRun(projectId, "Agent started", {
      company: record.company_name,
      rowId,
      agent,
    });
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
    logRun(projectId, "Agent completed", {
      company: record.company_name,
      rowId,
      agent,
      summary: agentResult.completionMessage,
    });
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
    logRun(projectId, "Agent started", {
      company: record.company_name,
      rowId,
      agent,
      mode: activeMode,
      action: "web search",
    });
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
        logRun(projectId, "Web search completed", {
          company: record.company_name,
          rowId,
          sources: pr.sources.length,
          decision: pr.decision,
        });
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
        logRun(projectId, "Web search failed; using fallback", {
          company: record.company_name,
          rowId,
        });
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
      logRun(projectId, "No API key; using cached evidence", {
        company: record.company_name,
        rowId,
        sources: pr.sources.length,
      });
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
      logRun(projectId, "Evidence captured", {
        company: record.company_name,
        rowId,
        title: source.title,
        sourceType: source.sourceType,
      });
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
    logRun(projectId, "Agent started", {
      company: record.company_name,
      rowId,
      agent,
    });
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
    logRun(projectId, "Agent completed", {
      company: record.company_name,
      rowId,
      agent,
      summary: agentResult.completionMessage,
    });
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
    logRun(projectId, "Agent started", {
      company: record.company_name,
      rowId,
      agent,
    });
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
    logRun(projectId, "Agent completed", {
      company: record.company_name,
      rowId,
      agent,
      summary: agentResult.completionMessage,
    });
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
    logRun(projectId, "Agent started", {
      company: record.company_name,
      rowId,
      agent,
    });
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
      logRun(projectId, "Field scored", {
        company: record.company_name,
        rowId,
        field: field.field,
        trustScore: field.trustScore,
        contradictions: field.contradictions.length,
      });
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

    logRun(projectId, "Agent completed", {
      company: record.company_name,
      rowId,
      agent,
      summary: agentResult.completionMessage,
    });
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
    logRun(projectId, "Agent started", {
      company: record.company_name,
      rowId,
      agent,
    });
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
    logRun(projectId, "Data PR ready", {
      company: record.company_name,
      rowId,
      decision: pr.decision,
      patches: pr.patchPreview.length,
    });

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
  logRun(projectId, "Row completed", {
    company: record.company_name,
    rowId,
    mode: activeMode,
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
        logRun(id, "Run started", {
          mode,
          rows: targetRows.length,
          scope: isProjectRun ? "project" : "row",
        });
        await resetProjectRows(id, targetRows.map((row) => row.id));
        if (isProjectRun) {
          await updateProjectStatus(id, "running");
        }
        await write(controller, state, id, {
          type: "run_started",
          mode,
          message: `GroundTruth agent pipeline started — ${targetRows.length} row${targetRows.length === 1 ? "" : "s"} queued.`,
          progress: 0,
        });

        logRun(id, "Launching concurrent row evaluations", {
          rows: targetRows.length,
        });

        const settled = await Promise.allSettled(
          targetRows.map((row, index) => emitCompany(controller, state, id, row.id, row.record, index, mode)),
        );

        for (const result of settled) {
          if (result.status === "fulfilled") {
            prs.push(result.value);
          } else {
            logRun(id, "Row evaluation failed", {
              error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            });
          }
        }

        const summary = summarize(prs);
        const hadFailures = settled.some((result) => result.status === "rejected");
        if (isProjectRun) {
          await updateProjectStatus(id, hadFailures ? "failed" : "completed");
        }
        if (hadFailures) {
          logRun(id, "Run completed with row failures", {
            mode,
            rows: targetRows.length,
            summary,
          });
          await write(controller, state, id, {
            type: "run_failed",
            mode,
            message: `Completed with ${settled.filter((result) => result.status === "rejected").length} row failure${settled.filter((result) => result.status === "rejected").length === 1 ? "" : "s"}.`,
            summary,
            progress: 100,
          });
        } else {
          if (isProjectRun) {
            await updateProjectStatus(id, "completed");
          }
          logRun(id, "Run completed", {
            mode,
            rows: targetRows.length,
            summary,
          });
          await write(controller, state, id, {
            type: "run_completed",
            mode,
            message: `All ${targetRows.length} row${targetRows.length === 1 ? "" : "s"} evaluated.`,
            summary,
            progress: 100,
          });
        }
      } catch (error) {
        console.error("GroundTruth project run failed.", error);
        logRun(id, "Run failed", {
          mode: "fallback",
          rows: targetRows.length,
          error: error instanceof Error ? error.message : String(error),
        });
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
