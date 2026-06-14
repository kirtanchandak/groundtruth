import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  type AgentEvent,
  type CellStatus,
  type CompanyRecord,
  type DataPR,
  type EvidenceSource,
  type FieldEval,
  type GridCellEval,
  type GridFieldKey,
  type Project,
  type ProjectRow,
  type ProjectSnapshot,
} from "./schemas";

type LocalStore = {
  projects: Project[];
  rows: Record<string, ProjectRow[]>;
};

type JsonObject = Record<string, unknown>;

declare global {
  var groundTruthLocalStore: LocalStore | undefined;
}

const gridFields: GridFieldKey[] = [
  "website",
  "linkedin_profile",
  "headcount",
  "hq",
  "funding",
  "industry",
  "segment_routing",
];

const currentValueByField: Record<GridFieldKey, (record: CompanyRecord) => string> = {
  website: (record) => record.website,
  linkedin_profile: (record) => record.linkedin_url,
  headcount: (record) => record.current_headcount,
  hq: (record) => record.current_hq,
  funding: (record) => record.current_funding,
  industry: (record) => record.current_industry,
  segment_routing: (record) => record.segment,
};

function getLocalStore() {
  globalThis.groundTruthLocalStore ??= { projects: [], rows: {} };
  return globalThis.groundTruthLocalStore;
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export function getPersistenceMode() {
  return getSupabase() ? "supabase" : "local";
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function initialCells(rowId: string, record: CompanyRecord): GridCellEval[] {
  return gridFields.map((fieldKey) => ({
    id: `cell-${rowId}-${fieldKey}`,
    rowId,
    fieldKey,
    currentValue: currentValueByField[fieldKey](record),
    proposedValue: currentValueByField[fieldKey](record),
    status: "queued" as CellStatus,
    contradictions: [],
    evidence: [],
  }));
}

function cellStatus(field: FieldEval): CellStatus {
  if (field.contradictions.length) return "conflict";
  if (field.proposedValue && field.proposedValue !== field.currentValue) return "changed";
  return "verified";
}

function normalizeFieldKey(field: FieldEval["field"]): GridFieldKey {
  return field;
}

function mapProject(row: JsonObject): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    filename: String(row.filename ?? ""),
    rowCount: Number(row.row_count ?? 0),
    status: String(row.status ?? "queued") as Project["status"],
    runStatus: row.run_status ? (String(row.run_status) as Project["runStatus"]) : undefined,
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  };
}

function mapRow(row: JsonObject, cells: GridCellEval[], dataPr?: DataPR, events: AgentEvent[] = []): ProjectRow {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    sourceIndex: Number(row.source_index ?? 0),
    record: row.raw_record as CompanyRecord,
    status: String(row.status ?? "queued") as ProjectRow["status"],
    progress: Number(row.progress ?? 0),
    selectedDecision: row.selected_decision ? String(row.selected_decision) : undefined,
    cells,
    dataPr,
    events,
  };
}

export async function createProject(input: {
  name?: string;
  filename?: string;
  rows: CompanyRecord[];
}): Promise<ProjectSnapshot> {
  const project: Project = {
    id: makeId("project"),
    name: input.name || input.filename?.replace(/\.csv$/i, "") || `Upload ${new Date().toLocaleTimeString()}`,
    filename: input.filename ?? "sample.csv",
    rowCount: input.rows.length,
    status: "queued",
    runStatus: "idle",
    createdAt: now(),
  };

  const rows: ProjectRow[] = input.rows.map((record, index) => {
    const rowId = makeId("row");
    const normalizedRecord = { ...record, id: record.id || rowId };
    return {
      id: rowId,
      projectId: project.id,
      sourceIndex: index,
      record: normalizedRecord,
      status: "queued",
      progress: 0,
      cells: initialCells(rowId, normalizedRecord),
      events: [],
    };
  });

  const supabase = getSupabase();
  if (!supabase) {
    const store = getLocalStore();
    store.projects = [project, ...store.projects];
    store.rows[project.id] = rows;
    return { mode: "local", project, rows };
  }

    await supabase.from("projects").insert({
      id: project.id,
      name: project.name,
      filename: project.filename,
      row_count: project.rowCount,
      status: project.status,
      run_status: project.runStatus,
      created_at: project.createdAt,
    });
  await supabase.from("company_rows").insert(
    rows.map((row) => ({
      id: row.id,
      project_id: row.projectId,
      source_index: row.sourceIndex,
      raw_record: row.record,
      status: row.status,
      progress: row.progress,
    })),
  );
  await supabase.from("cell_evals").insert(
    rows.flatMap((row) =>
      row.cells.map((cell) => ({
        id: cell.id,
        row_id: row.id,
        field_key: cell.fieldKey,
        current_value: cell.currentValue,
        proposed_value: cell.proposedValue,
        status: cell.status,
        contradictions: cell.contradictions,
      })),
    ),
  );

  return { mode: "supabase", project, rows };
}

export async function listProjects() {
  const supabase = getSupabase();
  if (!supabase) {
    const store = getLocalStore();
    return { mode: "local" as const, projects: store.projects };
  }

  const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
  return { mode: "supabase" as const, projects: (data ?? []).map(mapProject) };
}

export async function getProject(projectId: string): Promise<ProjectSnapshot | null> {
  const supabase = getSupabase();
  if (!supabase) {
    const store = getLocalStore();
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) return null;
    return { mode: "local", project, rows: store.rows[projectId] ?? [] };
  }

  const { data: projectRow } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!projectRow) return null;

  const { data: rowData } = await supabase
    .from("company_rows")
    .select("*")
    .eq("project_id", projectId)
    .order("source_index", { ascending: true });
  const rowIds = (rowData ?? []).map((row) => String(row.id));
  const { data: cellData } = rowIds.length
    ? await supabase.from("cell_evals").select("*").in("row_id", rowIds)
    : { data: [] };
  const { data: evidenceData } = rowIds.length
    ? await supabase.from("evidence_sources").select("*").in("row_id", rowIds)
    : { data: [] };
  const { data: prData } = rowIds.length ? await supabase.from("data_prs").select("*").in("row_id", rowIds) : { data: [] };
  const { data: eventData } = await supabase
    .from("agent_events")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const cellsByRow = new Map<string, GridCellEval[]>();
  for (const cell of cellData ?? []) {
    const rowId = String(cell.row_id);
    const evidence = (evidenceData ?? [])
      .filter((item) => item.cell_eval_id === cell.id || item.row_id === rowId)
      .map((item) => ({
        title: String(item.title),
        url: String(item.url),
        sourceType: String(item.source_type) as EvidenceSource["sourceType"],
        claim: String(item.claim),
      }));
    const mapped: GridCellEval = {
      id: String(cell.id),
      rowId,
      fieldKey: String(cell.field_key) as GridFieldKey,
      currentValue: String(cell.current_value ?? ""),
      proposedValue: String(cell.proposed_value ?? ""),
      trustScore: cell.trust_score === null ? undefined : Number(cell.trust_score),
      status: String(cell.status ?? "queued") as CellStatus,
      rationale: cell.rationale ? String(cell.rationale) : undefined,
      contradictions: Array.isArray(cell.contradictions) ? (cell.contradictions as string[]) : [],
      evidence,
    };
    cellsByRow.set(rowId, [...(cellsByRow.get(rowId) ?? []), mapped]);
  }

  const prsByRow = new Map<string, DataPR>();
  for (const pr of prData ?? []) {
    const rowId = String(pr.row_id);
    const baseRow = rowData?.find((row) => row.id === rowId);
    const record = baseRow?.raw_record as CompanyRecord | undefined;
    const cells = cellsByRow.get(rowId) ?? [];
    prsByRow.set(rowId, {
      id: String(pr.id),
      company: record?.company_name ?? "",
      website: record?.website ?? "",
      owner: record?.account_owner ?? "",
      segment: record?.segment ?? "",
      priority: String(pr.priority) as DataPR["priority"],
      decision: String(pr.decision) as DataPR["decision"],
      recommendedAction: String(pr.recommended_action),
      businessImpact: String(pr.business_impact),
      patchPreview: Array.isArray(pr.patch_preview) ? DataPRPatchPreview(pr.patch_preview) : [],
      fieldReviews: cells
        .filter((cell) => cell.trustScore !== undefined)
        .map((cell) => ({
          field: cell.fieldKey,
          currentValue: cell.currentValue,
          proposedValue: cell.proposedValue,
          trustScore: cell.trustScore ?? 0,
          rationale: cell.rationale ?? "",
          contradictions: cell.contradictions,
          evidence: cell.evidence,
        })),
      sources: cells.flatMap((cell) => cell.evidence),
    });
  }

  const eventsByRow = new Map<string, AgentEvent[]>();
  for (const event of eventData ?? []) {
    const rowId = event.row_id ? String(event.row_id) : "";
    if (!rowId) continue;
    eventsByRow.set(rowId, [
      ...(eventsByRow.get(rowId) ?? []),
      {
        id: String(event.id),
        type: String(event.type) as AgentEvent["type"],
        runId: String(event.project_id),
        companyId: rowId,
        agent: event.agent ? (String(event.agent) as AgentEvent["agent"]) : undefined,
        message: event.message ? String(event.message) : undefined,
        timestamp: String(event.created_at),
      },
    ]);
  }

  const rows = (rowData ?? []).map((row) => mapRow(row, cellsByRow.get(String(row.id)) ?? [], prsByRow.get(String(row.id)), eventsByRow.get(String(row.id))));

  return { mode: "supabase", project: mapProject(projectRow), rows };
}

function DataPRPatchPreview(value: unknown[]) {
  return value
    .filter((item): item is { field: string; from: string; to: string } => {
      return Boolean(item && typeof item === "object" && "field" in item && "from" in item && "to" in item);
    })
    .map((item) => ({ field: String(item.field), from: String(item.from), to: String(item.to) }));
}

function mutateLocal(projectId: string, updater: (project: Project, rows: ProjectRow[]) => void) {
  const store = getLocalStore();
  const project = store.projects.find((item) => item.id === projectId);
  if (!project) return;
  updater(project, store.rows[projectId] ?? []);
}

export async function updateProjectStatus(projectId: string, status: Project["status"]) {
  const completedAt = status === "completed" ? now() : undefined;
  const supabase = getSupabase();
  if (!supabase) {
    mutateLocal(projectId, (project) => {
      project.status = status;
      project.runStatus = status === "queued" ? "idle" : status;
      project.completedAt = completedAt;
    });
    return;
  }
  await supabase
    .from("projects")
    .update({ status, run_status: status === "queued" ? "idle" : status, completed_at: completedAt ?? null })
    .eq("id", projectId);
}

export async function setProjectRunStatus(projectId: string, runStatus: Project["runStatus"]) {
  const supabase = getSupabase();
  if (!supabase) {
    mutateLocal(projectId, (project) => {
      project.runStatus = runStatus;
      if (runStatus && runStatus !== "idle") {
        project.status = runStatus;
      } else if (runStatus === "idle") {
        project.status = "queued";
      }
    });
    return;
  }
  await supabase
    .from("projects")
    .update({ run_status: runStatus, status: runStatus && runStatus !== "idle" ? runStatus : "queued" })
    .eq("id", projectId);
}

export async function resetProjectRows(projectId: string, rowIds: string[]) {
  if (!rowIds.length) return;

  const supabase = getSupabase();
  if (!supabase) {
    mutateLocal(projectId, (_project, rows) => {
      for (const row of rows) {
        if (!rowIds.includes(row.id)) continue;
        row.status = "queued";
        row.progress = 0;
        row.dataPr = undefined;
        row.events = [];
        row.selectedDecision = undefined;
        row.cells = row.cells.map((cell) => ({
          ...cell,
          status: "queued",
          trustScore: undefined,
          rationale: undefined,
          contradictions: [],
          evidence: [],
          proposedValue: cell.currentValue,
        }));
      }
    });
    return;
  }

  await supabase.from("company_rows").update({ status: "queued", progress: 0, selected_decision: null }).eq("project_id", projectId).in("id", rowIds);
  await supabase.from("cell_evals").delete().in("row_id", rowIds);
  await supabase.from("data_prs").delete().in("row_id", rowIds);
  await supabase.from("evidence_sources").delete().in("row_id", rowIds);
  await supabase.from("agent_events").delete().eq("project_id", projectId).in("row_id", rowIds);
}

export async function updateRowStatus(projectId: string, rowId: string, status: ProjectRow["status"], progress: number) {
  const supabase = getSupabase();
  if (!supabase) {
    mutateLocal(projectId, (_project, rows) => {
      const row = rows.find((item) => item.id === rowId);
      if (row) {
        row.status = status;
        row.progress = progress;
      }
    });
    return;
  }
  await supabase.from("company_rows").update({ status, progress }).eq("id", rowId);
}

export async function upsertCellEval(projectId: string, rowId: string, field: FieldEval) {
  const fieldKey = normalizeFieldKey(field.field);
  const cell: GridCellEval = {
    id: `cell-${rowId}-${fieldKey}`,
    rowId,
    fieldKey,
    currentValue: field.currentValue,
    proposedValue: field.proposedValue,
    trustScore: field.trustScore,
    status: cellStatus(field),
    rationale: field.rationale,
    contradictions: field.contradictions,
    evidence: field.evidence,
  };
  const supabase = getSupabase();
  if (!supabase) {
    mutateLocal(projectId, (_project, rows) => {
      const row = rows.find((item) => item.id === rowId);
      if (!row) return;
      row.cells = [...row.cells.filter((item) => item.fieldKey !== fieldKey), cell];
    });
    return cell;
  }
  await supabase.from("cell_evals").upsert({
    id: cell.id,
    row_id: rowId,
    field_key: cell.fieldKey,
    current_value: cell.currentValue,
    proposed_value: cell.proposedValue,
    trust_score: cell.trustScore,
    status: cell.status,
    rationale: cell.rationale,
    contradictions: cell.contradictions,
    updated_at: now(),
  });
  return cell;
}

export async function insertEvidence(projectId: string, rowId: string, fieldKey: GridFieldKey | undefined, source: EvidenceSource) {
  const supabase = getSupabase();
  if (!supabase) {
    mutateLocal(projectId, (_project, rows) => {
      const row = rows.find((item) => item.id === rowId);
      if (!row) return;
      const targetField = fieldKey ?? "website";
      row.cells = row.cells.map((cell) =>
        cell.fieldKey === targetField ? { ...cell, evidence: [...cell.evidence, source] } : cell,
      );
    });
    return;
  }
  await supabase.from("evidence_sources").insert({
    id: makeId("evidence"),
    cell_eval_id: fieldKey ? `cell-${rowId}-${fieldKey}` : null,
    row_id: rowId,
    title: source.title,
    url: source.url,
    source_type: source.sourceType,
    claim: source.claim,
  });
}

export async function upsertDataPr(projectId: string, rowId: string, pr: DataPR) {
  const supabase = getSupabase();
  if (!supabase) {
    mutateLocal(projectId, (_project, rows) => {
      const row = rows.find((item) => item.id === rowId);
      if (row) row.dataPr = pr;
    });
    return;
  }
  await supabase.from("data_prs").upsert({
    id: pr.id,
    row_id: rowId,
    priority: pr.priority,
    decision: pr.decision,
    recommended_action: pr.recommendedAction,
    business_impact: pr.businessImpact,
    patch_preview: pr.patchPreview,
    updated_at: now(),
  });
}

export async function insertAgentEvent(projectId: string, rowId: string | undefined, event: AgentEvent, fieldKey?: GridFieldKey) {
  const supabase = getSupabase();
  if (!supabase) {
    mutateLocal(projectId, (_project, rows) => {
      if (!rowId) return;
      const row = rows.find((item) => item.id === rowId);
      if (row) row.events = [event, ...row.events].slice(0, 120);
    });
    return;
  }
  await supabase.from("agent_events").insert({
    id: event.id,
    project_id: projectId,
    row_id: rowId ?? null,
    field_key: fieldKey ?? null,
    agent: event.agent ?? null,
    type: event.type,
    message: event.message ?? null,
    payload: event as unknown as JsonObject,
    created_at: event.timestamp,
  });
}

export async function updateRowDecision(projectId: string, rowId: string, decision: string) {
  const supabase = getSupabase();
  if (!supabase) {
    mutateLocal(projectId, (_project, rows) => {
      const row = rows.find((item) => item.id === rowId);
      if (row) row.selectedDecision = decision;
    });
    return;
  }
  await supabase.from("company_rows").update({ selected_decision: decision }).eq("id", rowId);
}
