"use client";

import {
  AlertTriangle,
  Check,
  CircleCheck,
  Clock3,
  Download,
  ExternalLink,
  FileSpreadsheet,
  GitPullRequest,
  Home,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { sampleRecords } from "@/lib/sample-data";
import {
  agentNameByRole,
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
  type ProjectsListResponse,
} from "@/lib/schemas";

type InspectorTab = "data-pr" | "reasoning" | "evidence" | "agent-trace" | "patch";
type ReviewerAction = "approved" | "rejected" | "escalated" | "accepted";

const fieldColumns: Array<{
  key: GridFieldKey;
  label: string;
  width: string;
}> = [
  { key: "website", label: "Website", width: "min-w-[190px]" },
  { key: "linkedin_profile", label: "LinkedIn", width: "min-w-[190px]" },
  { key: "headcount", label: "Headcount", width: "min-w-[150px]" },
  { key: "hq", label: "HQ", width: "min-w-[150px]" },
  { key: "funding", label: "Funding", width: "min-w-[150px]" },
  { key: "industry", label: "Industry", width: "min-w-[180px]" },
  { key: "segment_routing", label: "Segment", width: "min-w-[150px]" },
];

const inspectorTabs: Array<{ key: InspectorTab; label: string }> = [
  { key: "data-pr", label: "Data PR" },
  { key: "reasoning", label: "Reasoning" },
  { key: "evidence", label: "Evidence" },
  { key: "agent-trace", label: "Agent Trace" },
  { key: "patch", label: "Patch" },
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

const statusStyle: Record<CellStatus, string> = {
  queued: "border-slate-200 bg-white text-slate-500",
  running: "border-cyan-200 bg-cyan-50 text-cyan-700",
  verified: "border-emerald-200 bg-emerald-50 text-emerald-700",
  changed: "border-blue-200 bg-blue-50 text-blue-700",
  conflict: "border-amber-200 bg-amber-50 text-amber-800",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const decisionLabels: Record<DataPR["decision"], string> = {
  accept_current: "Accept current",
  approve_update: "Approve update",
  escalate_human: "Human review",
  contact_company: "Contact company",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeCsvRow(row: Record<string, string>, index: number): CompanyRecord {
  const clean = (key: string) => String(row[key] ?? "").trim();

  return {
    id: `csv-${index}-${clean("company_name") || clean("company") || "company"}`,
    company_name: clean("company_name") || clean("company"),
    website: clean("website"),
    linkedin_url: clean("linkedin_url") || clean("linkedin"),
    current_headcount: clean("current_headcount") || clean("headcount"),
    current_hq: clean("current_hq") || clean("hq"),
    current_funding: clean("current_funding") || clean("funding"),
    current_industry: clean("current_industry") || clean("industry"),
    account_owner: clean("account_owner") || clean("owner"),
    segment: clean("segment"),
  };
}

function parseCsv(text: string) {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length) {
    throw new Error(parsed.errors[0]?.message ?? "Could not parse CSV.");
  }

  const rows = parsed.data.map(normalizeCsvRow).filter((record) => record.company_name.length > 0);
  if (!rows.length) throw new Error("CSV needs at least one company_name value.");
  return rows;
}

function averageTrust(row?: ProjectRow) {
  const scores = row?.cells.map((cell) => cell.trustScore).filter((score): score is number => typeof score === "number") ?? [];
  return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
}

function cellStatusFromField(field: FieldEval): CellStatus {
  if (field.contradictions.length) return "conflict";
  if (field.proposedValue && field.proposedValue !== field.currentValue) return "changed";
  return "verified";
}

function buildQueuedCell(rowId: string, fieldKey: GridFieldKey, record: CompanyRecord): GridCellEval {
  return {
    id: `cell-${rowId}-${fieldKey}`,
    rowId,
    fieldKey,
    currentValue: currentValueByField[fieldKey](record),
    proposedValue: currentValueByField[fieldKey](record),
    status: "queued",
    contradictions: [],
    evidence: [],
  };
}

function getCell(row: ProjectRow | null, fieldKey: GridFieldKey | null) {
  if (!row || !fieldKey) return null;
  return row.cells.find((cell) => cell.fieldKey === fieldKey) ?? buildQueuedCell(row.id, fieldKey, row.record);
}

function reviewerText(action?: ReviewerAction) {
  if (!action) return "Pending";
  if (action === "approved") return "Approved";
  if (action === "rejected") return "Rejected";
  if (action === "escalated") return "Escalated";
  return "Accepted";
}

export default function DashboardPage({ projectIdFromRoute }: { projectIdFromRoute?: string } = {}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mode, setMode] = useState<"supabase" | "local">("local");
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<GridFieldKey | null>(null);
  const [activeTab, setActiveTab] = useState<InspectorTab>("data-pr");
  const [actions, setActions] = useState<Record<string, ReviewerAction>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [error, setError] = useState("");

  const selectedRow = useMemo(() => {
    return rows.find((row) => row.id === selectedRowId) ?? null;
  }, [rows, selectedRowId]);
  const selectedCell = getCell(selectedRow, selectedField);
  const canInspect = Boolean(selectedRow);

  const projectEvents = useMemo(() => {
    const rowEvents = rows.flatMap((row) => row.events);
    return [...events, ...rowEvents].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 120);
  }, [events, rows]);

  const completedRows = rows.filter((row) => row.status === "completed").length;
  const changedCells = rows.flatMap((row) => row.cells).filter((cell) => cell.status === "changed").length;
  const conflictCells = rows.flatMap((row) => row.cells).filter((cell) => cell.status === "conflict").length;

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const response = await fetch("/api/projects");
      const payload = (await response.json()) as ProjectsListResponse;
      if (cancelled) return;

      setProjects(payload.projects);
      setMode(payload.mode);

      if (projectIdFromRoute) {
        const projectResponse = await fetch(`/api/projects/${projectIdFromRoute}`);
        if (!projectResponse.ok) {
          setError("Project not found. Create a new upload or choose a project from the sidebar.");
          setActiveProject(null);
          setRows([]);
          setSelectedRowId(null);
          setIsRunning(false);
          return;
        }

        const snapshot = (await projectResponse.json()) as ProjectSnapshot;
        if (cancelled) return;

        setMode(snapshot.mode);
        setActiveProject(snapshot.project);
        setRows(snapshot.rows);
        setSelectedRowId(null);
        setSelectedField(null);
        setEvents([]);
        setActiveTab("data-pr");
        setIsRunning(snapshot.project.status === "running");
        return;
      }

      setActiveProject(null);
      setRows([]);
      setSelectedRowId(null);
      setIsRunning(false);
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [projectIdFromRoute]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setProjectsOpen(window.innerWidth >= 1024);
      setInspectorOpen(window.innerWidth >= 1280);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function refreshProjects(selectProjectId?: string) {
    const response = await fetch("/api/projects");
    const payload = (await response.json()) as ProjectsListResponse;
    setProjects(payload.projects);
    setMode(payload.mode);

    const nextId = selectProjectId ?? activeProject?.id;
    if (nextId) {
      await loadProject(nextId);
    }
  }

  function setProjectUrl(projectId: string) {
    const nextPath = `/project/${projectId}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
  }

  async function loadProject(projectId: string, options: { updateUrl?: boolean } = {}) {
    const response = await fetch(`/api/projects/${projectId}`);
    if (!response.ok) return;
    const snapshot = (await response.json()) as ProjectSnapshot;
    if (options.updateUrl) setProjectUrl(projectId);
    setMode(snapshot.mode);
    setActiveProject(snapshot.project);
    setRows(snapshot.rows);
    setSelectedRowId(null);
    setSelectedField(null);
    setEvents([]);
    setActiveTab("data-pr");
    setIsRunning(snapshot.project.status === "running");
  }

  async function createProjectFromRows(input: { rows: CompanyRecord[]; filename: string; name?: string }) {
    setError("");
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload?.detail ?? "Could not create project.");
    }

    const snapshot = (await response.json()) as ProjectSnapshot;
    setProjectUrl(snapshot.project.id);
    setMode(snapshot.mode);
    setActiveProject(snapshot.project);
    setProjects((current) => [snapshot.project, ...current.filter((project) => project.id !== snapshot.project.id)]);
    setRows(snapshot.rows);
    setSelectedRowId(null);
    setSelectedField(null);
    setEvents([]);
    setActions({});
    setActiveTab("data-pr");
    await runProject(snapshot.project.id);
  }

  async function runProject(projectId: string) {
    setIsRunning(true);
    setError("");
    setEvents([]);
    setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, status: "running" } : project)));
    setActiveProject((current) => (current?.id === projectId ? { ...current, status: "running" } : current));

    try {
      const response = await fetch(`/api/projects/${projectId}/run`, { method: "POST" });
      if (!response.ok || !response.body) throw new Error("Could not start project run.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          handleStreamEvent(JSON.parse(dataLine.slice(6)) as AgentEvent);
        }
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not run project.");
      setActiveProject((current) => (current?.id === projectId ? { ...current, status: "failed" } : current));
    } finally {
      setIsRunning(false);
      await refreshProjects(projectId);
    }
  }

  function handleStreamEvent(event: AgentEvent) {
    setEvents((current) => [event, ...current].slice(0, 120));

    if (event.type === "run_started") {
      setActiveProject((current) => (current ? { ...current, status: "running" } : current));
    }

    if (event.type === "run_completed") {
      setActiveProject((current) => (current ? { ...current, status: "completed", completedAt: event.timestamp } : current));
    }

    if (!event.companyId) return;

    setRows((current) =>
      current.map((row) => {
        if (row.id !== event.companyId) return row;

        if (event.type === "company_started") {
          return { ...row, status: "running", progress: event.progress ?? row.progress };
        }

        if (event.type === "agent_started") {
          const nextRows = { ...row, status: "running" as const, progress: event.progress ?? row.progress };
          if (event.fieldKey) {
            return {
              ...nextRows,
              cells: row.cells.map((cell) =>
                cell.fieldKey === event.fieldKey ? { ...cell, status: "running" as const } : cell,
              ),
            };
          }
          return nextRows;
        }

        if (event.type === "field_update" && event.field) {
          const fieldKey = event.field.field as GridFieldKey;
          const nextCell: GridCellEval = {
            id: `cell-${row.id}-${fieldKey}`,
            rowId: row.id,
            fieldKey,
            currentValue: event.field.currentValue,
            proposedValue: event.field.proposedValue,
            trustScore: event.field.trustScore,
            status: cellStatusFromField(event.field),
            rationale: event.field.rationale,
            contradictions: event.field.contradictions,
            evidence: event.field.evidence,
          };
          return {
            ...row,
            progress: event.progress ?? row.progress,
            cells: [...row.cells.filter((cell) => cell.fieldKey !== fieldKey), nextCell],
          };
        }

        if (event.type === "evidence_found" && event.evidence) {
          const targetField = (event.fieldKey as GridFieldKey | undefined) ?? "website";
          return {
            ...row,
            cells: row.cells.map((cell) =>
              cell.fieldKey === targetField ? { ...cell, evidence: [...cell.evidence, event.evidence as EvidenceSource] } : cell,
            ),
          };
        }

        if (event.type === "data_pr_created" && event.pr) {
          return { ...row, dataPr: event.pr, progress: 100 };
        }

        if (event.type === "company_completed") {
          return { ...row, status: "completed", progress: 100 };
        }

        return { ...row, progress: event.progress ?? row.progress };
      }),
    );
  }

  function runSample() {
    void createProjectFromRows({
      rows: sampleRecords,
      filename: "sample-b2b-accounts.csv",
      name: `Sample upload ${new Date().toLocaleTimeString()}`,
    }).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Could not load sample."));
  }

  function handleFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        void createProjectFromRows({
          rows: parseCsv(String(reader.result ?? "")),
          filename: file.name,
          name: file.name.replace(/\.csv$/i, ""),
        }).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Could not create project."));
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Could not parse CSV.");
      }
    };
    reader.readAsText(file);
  }

  async function updateReviewerAction(row: ProjectRow, action: ReviewerAction) {
    setActions((current) => ({ ...current, [row.id]: action }));
    await fetch(`/api/projects/${row.projectId}/rows/${row.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: action }),
    });
  }

  function selectRow(rowId: string) {
    setSelectedRowId(rowId);
    setSelectedField(null);
    setActiveTab("data-pr");
    setInspectorOpen(true);
  }

  function selectCell(rowId: string, fieldKey: GridFieldKey) {
    setSelectedRowId(rowId);
    setSelectedField(fieldKey);
    setActiveTab("reasoning");
    setInspectorOpen(true);
  }

  function exportPatch() {
    const approvedRows = rows.filter((row) => actions[row.id] === "approved" && row.dataPr);
    const lines = [
      "company,field,from,to,business_impact",
      ...approvedRows.flatMap((row) =>
        (row.dataPr?.patchPreview ?? []).map((patch) =>
          [row.record.company_name, patch.field, patch.from, patch.to, row.dataPr?.businessImpact ?? ""]
            .map((value) => `"${value.replaceAll('"', '""')}"`)
            .join(","),
        ),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeProject?.name ?? "groundtruth"}-patch.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex min-h-screen bg-[#f6f7f9] text-slate-950">
      {projectsOpen ? (
        <button
          className="fixed inset-0 z-30 bg-slate-950/25 lg:hidden"
          onClick={() => setProjectsOpen(false)}
          type="button"
          aria-label="Close projects sidebar"
        />
      ) : null}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-[300px] shrink-0 flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform lg:static lg:z-auto lg:w-[280px] lg:shadow-none",
          projectsOpen ? "translate-x-0" : "-translate-x-full lg:hidden",
        )}
      >
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">GroundTruth</p>
                <p className="text-xs text-slate-500">Projects</p>
              </div>
            </div>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              onClick={() => setProjectsOpen(false)}
              type="button"
              aria-label="Collapse projects sidebar"
              title="Collapse projects sidebar"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
              onClick={() => fileInputRef.current?.click()}
              disabled={isRunning}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Upload
            </button>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              onClick={runSample}
              disabled={isRunning}
              type="button"
            >
              Sample
            </button>
          </div>
          <input
            ref={fileInputRef}
            className="hidden"
            accept=".csv,text/csv"
            type="file"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase text-slate-500">Recent uploads</p>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">{mode}</span>
          </div>
          <div className="space-y-2">
            {projects.length ? (
              projects.map((project) => (
                <button
                  key={project.id}
                  className={cx(
                    "w-full rounded-md border p-3 text-left hover:bg-slate-50",
                    activeProject?.id === project.id ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white",
                  )}
                  onClick={() => {
                    void loadProject(project.id, { updateUrl: true });
                    if (window.innerWidth < 1024) setProjectsOpen(false);
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">{project.name}</p>
                    <ProjectStatus status={project.status} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{project.rowCount} rows</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(project.createdAt).toLocaleString()}</p>
                </button>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm leading-6 text-slate-500">
                <p>Upload a CSV to create your first project.</p>
                <button
                  className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Create project
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="flex flex-col gap-3 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Link className="inline-flex items-center gap-1 hover:text-slate-900" href="/">
                  <Home className="h-3.5 w-3.5" aria-hidden="true" />
                  Landing
                </Link>
                <span>/</span>
                <Link className="hover:text-slate-900" href="/dashboard">
                  Dashboard
                </Link>
                {activeProject ? (
                  <>
                    <span>/</span>
                    <span>Project</span>
                  </>
                ) : null}
              </div>
              <h1 className="mt-1 truncate text-xl font-semibold">{activeProject?.name ?? "New data project"}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setProjectsOpen((current) => !current)}
                type="button"
                aria-pressed={projectsOpen}
                title={projectsOpen ? "Hide projects" : "Show projects"}
              >
                {projectsOpen ? (
                  <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
                )}
                Projects
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                onClick={() => setInspectorOpen((current) => !current)}
                disabled={!canInspect}
                type="button"
                aria-pressed={inspectorOpen}
                title={inspectorOpen ? "Hide inspector" : "Show inspector"}
              >
                {inspectorOpen ? (
                  <PanelRightClose className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
                )}
                Inspector
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => void refreshProjects()}
                type="button"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Refresh
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
                onClick={runSample}
                disabled={isRunning}
                type="button"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Run Sample
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:bg-slate-400"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRunning}
                type="button"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className={cx("grid min-h-0 flex-1", canInspect && inspectorOpen && "xl:grid-cols-[minmax(0,1fr)_430px]")}>
          <section className="min-w-0 overflow-hidden">
            {rows.length ? (
              <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-white px-4 py-3 md:grid-cols-4">
                <Metric label="Rows" value={String(rows.length)} />
                <Metric label="Complete" value={`${completedRows}/${rows.length || 0}`} />
                <Metric label="Changed" value={String(changedCells)} />
                <Metric label="Conflicts" value={String(conflictCells)} />
              </div>
            ) : null}

            <div className={cx("overflow-auto", rows.length ? "h-[calc(100vh-168px)]" : "h-[calc(100vh-81px)]")}>
              {rows.length ? (
                <table className="w-full min-w-[1420px] border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_#e2e8f0]">
                    <tr className="text-left text-xs uppercase text-slate-500">
                      <th className="sticky left-0 z-20 min-w-[250px] border-r border-slate-200 bg-slate-50 px-3 py-2 font-medium">
                        Company
                      </th>
                      {fieldColumns.map((column) => (
                        <th key={column.key} className={cx("border-r border-slate-200 px-3 py-2 font-medium", column.width)}>
                          {column.label}
                        </th>
                      ))}
                      <th className="min-w-[130px] border-r border-slate-200 px-3 py-2 font-medium">Trust</th>
                      <th className="min-w-[150px] px-3 py-2 font-medium">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const trust = averageTrust(row);
                      return (
                        <tr
                          key={row.id}
                          className={cx("group", selectedRow?.id === row.id && !selectedField && "bg-cyan-50/40")}
                        >
                          <td
                            className="sticky left-0 z-[5] cursor-pointer border-b border-r border-slate-200 bg-white px-3 py-1.5 group-hover:bg-slate-50"
                            onClick={() => selectRow(row.id)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{row.record.company_name}</p>
                                <p className="truncate text-[11px] text-slate-500">{row.record.account_owner || "No owner"}</p>
                              </div>
                              {row.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-cyan-600" aria-hidden="true" /> : null}
                            </div>
                          </td>
                          {fieldColumns.map((column) => (
                            <td key={`${row.id}-${column.key}`} className="border-b border-r border-slate-200 bg-white p-0">
                              <CellButton
                                cell={getCell(row, column.key)}
                                fallbackValue={currentValueByField[column.key](row.record)}
                                selected={selectedRow?.id === row.id && selectedField === column.key}
                                onClick={() => selectCell(row.id, column.key)}
                              />
                            </td>
                          ))}
                          <td className="border-b border-r border-slate-200 bg-white px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 rounded-full bg-slate-100">
                                <div
                                  className={cx(
                                    "h-2 rounded-full",
                                    trust < 40 ? "bg-red-500" : trust < 70 ? "bg-amber-500" : "bg-emerald-500",
                                  )}
                                  style={{ width: `${trust}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-slate-600">{trust || "-"}</span>
                            </div>
                          </td>
                          <td className="border-b border-slate-200 bg-white px-3 py-1.5">
                            {row.dataPr ? (
                              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                                {reviewerText(actions[row.id])}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Pending</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="grid h-full place-items-center p-8 text-center">
                  <div className="max-w-lg">
                    <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-slate-950 text-white">
                        <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <h2 className="mt-4 text-lg font-semibold">Upload CSV</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Create a project, render rows instantly, and start agent research in the grid.
                      </p>
                      <div className="mt-5 flex justify-center gap-2">
                        <button
                          className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                          onClick={() => fileInputRef.current?.click()}
                          type="button"
                        >
                          <Upload className="h-4 w-4" aria-hidden="true" />
                          Upload CSV
                        </button>
                        <button
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={runSample}
                          type="button"
                        >
                          Run Sample
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {canInspect && inspectorOpen ? (
            <>
              <button
                className="fixed inset-0 z-30 bg-slate-950/25 xl:hidden"
                onClick={() => setInspectorOpen(false)}
                type="button"
                aria-label="Close inspector"
              />
              <Inspector
                row={selectedRow}
                cell={selectedCell}
                selectedField={selectedField}
                events={projectEvents.filter((event) => !selectedRow || event.companyId === selectedRow.id || !event.companyId)}
                tab={activeTab}
                onTabChange={setActiveTab}
                action={selectedRow ? actions[selectedRow.id] : undefined}
                onAction={(action) => selectedRow && void updateReviewerAction(selectedRow, action)}
                onExport={exportPatch}
                exportDisabled={!Object.values(actions).includes("approved")}
                onClose={() => setInspectorOpen(false)}
              />
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ProjectStatus({ status }: { status: Project["status"] }) {
  const styles: Record<Project["status"], string> = {
    queued: "bg-slate-100 text-slate-600",
    running: "bg-cyan-50 text-cyan-700",
    completed: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
  };
  return <span className={cx("rounded-md px-2 py-1 text-[11px] font-semibold", styles[status])}>{status}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function CellButton({
  cell,
  fallbackValue,
  selected,
  onClick,
}: {
  cell: GridCellEval | null;
  fallbackValue: string;
  selected: boolean;
  onClick: () => void;
}) {
  const status = cell?.status ?? "queued";
  const value = cell?.proposedValue || cell?.currentValue || fallbackValue || "Missing";
  const changed = cell?.proposedValue && cell.proposedValue !== cell.currentValue;

  return (
    <button
      className={cx(
        "flex min-h-10 w-full flex-col items-start justify-center gap-0.5 px-2.5 py-1.5 text-left hover:bg-slate-50",
        selected && "bg-cyan-50 ring-1 ring-inset ring-cyan-400",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-800">{value}</span>
        {status === "running" ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-600" aria-hidden="true" /> : null}
        {status === "conflict" ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" /> : null}
      </span>
      <span className={cx("rounded border px-1 py-0.5 text-[10px] font-semibold", statusStyle[status])}>
        {status === "running" ? "running" : changed ? `to ${cell?.proposedValue}` : cell?.trustScore ? `${cell.trustScore}% trust` : status}
      </span>
    </button>
  );
}

function Inspector({
  row,
  cell,
  selectedField,
  events,
  tab,
  onTabChange,
  action,
  onAction,
  onExport,
  exportDisabled,
  onClose,
}: {
  row: ProjectRow | null;
  cell: GridCellEval | null;
  selectedField: GridFieldKey | null;
  events: AgentEvent[];
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  action?: ReviewerAction;
  onAction: (action: ReviewerAction) => void;
  onExport: () => void;
  exportDisabled: boolean;
  onClose: () => void;
}) {
  const evidence = selectedField ? cell?.evidence ?? [] : row?.cells.flatMap((item) => item.evidence) ?? [];

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,430px)] min-w-0 flex-col border-l border-slate-200 bg-white shadow-2xl xl:static xl:z-auto xl:w-auto xl:shadow-none">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-slate-500">Inspector</p>
            <h2 className="mt-1 truncate text-lg font-semibold">{row?.record.company_name ?? "No row selected"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {selectedField ? fieldColumns.find((field) => field.key === selectedField)?.label : "Row-level Data PR"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GitPullRequest className="h-5 w-5 text-slate-400" aria-hidden="true" />
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
              onClick={onClose}
              type="button"
              aria-label="Collapse inspector"
              title="Collapse inspector"
            >
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 py-2">
        {inspectorTabs.map((item) => (
          <button
            key={item.key}
            className={cx(
              "h-8 shrink-0 rounded-md px-2.5 text-xs font-semibold",
              tab === item.key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
            onClick={() => onTabChange(item.key)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!row ? (
          <EmptyInspector />
        ) : (
          <>
            {tab === "data-pr" ? (
              <DataPrTab row={row} action={action} onAction={onAction} />
            ) : null}
            {tab === "reasoning" ? (
              <ReasoningTab row={row} cell={cell} selectedField={selectedField} />
            ) : null}
            {tab === "evidence" ? <EvidenceTab evidence={evidence} /> : null}
            {tab === "agent-trace" ? <AgentTraceTab events={events} /> : null}
            {tab === "patch" ? (
              <PatchTab row={row} onExport={onExport} exportDisabled={exportDisabled} />
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function EmptyInspector() {
  return (
    <div className="grid min-h-[320px] place-items-center text-center text-sm text-slate-500">
      Select a row or cell to inspect agent output.
    </div>
  );
}

function DataPrTab({
  row,
  action,
  onAction,
}: {
  row: ProjectRow;
  action?: ReviewerAction;
  onAction: (action: ReviewerAction) => void;
}) {
  if (!row.dataPr) {
    return <PendingPanel icon={<Clock3 className="h-5 w-5" />} title="Data PR pending" body="The Data PR Writer will draft a recommendation when field evals complete." />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase text-slate-500">Recommendation</p>
        <p className="mt-2 text-sm font-semibold text-slate-950">{row.dataPr.recommendedAction}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{row.dataPr.businessImpact}</p>
        <div className="mt-3 inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-700">
          {decisionLabels[row.dataPr.decision]}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ActionButton icon={<Check className="h-4 w-4" />} label="Approve" active={action === "approved"} onClick={() => onAction("approved")} />
        <ActionButton icon={<X className="h-4 w-4" />} label="Reject" active={action === "rejected"} onClick={() => onAction("rejected")} />
        <ActionButton icon={<AlertTriangle className="h-4 w-4" />} label="Escalate" active={action === "escalated"} onClick={() => onAction("escalated")} />
        <ActionButton icon={<CircleCheck className="h-4 w-4" />} label="Accept" active={action === "accepted"} onClick={() => onAction("accepted")} />
      </div>
      <p className="text-xs text-slate-500">Reviewer state: {reviewerText(action)}</p>
    </div>
  );
}

function ReasoningTab({
  row,
  cell,
  selectedField,
}: {
  row: ProjectRow;
  cell: GridCellEval | null;
  selectedField: GridFieldKey | null;
}) {
  const cells = selectedField && cell ? [cell] : row.cells.filter((item) => item.rationale);

  if (!cells.length) {
    return <PendingPanel icon={<Search className="h-5 w-5" />} title="Reasoning pending" body="Click a running or completed cell to inspect field-level reasoning." />;
  }

  return (
    <div className="space-y-3">
      {cells.map((item) => (
        <div key={item.id} className="rounded-md border border-slate-200 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold capitalize">{item.fieldKey.replaceAll("_", " ")}</p>
            <span className={cx("rounded-md border px-2 py-1 text-xs font-semibold", statusStyle[item.status])}>{item.status}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.rationale || "No rationale yet."}</p>
          {item.contradictions.length ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-800">
              {item.contradictions.join(" ")}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function EvidenceTab({ evidence }: { evidence: EvidenceSource[] }) {
  if (!evidence.length) {
    return <PendingPanel icon={<Search className="h-5 w-5" />} title="Evidence pending" body="Source Hunter evidence will appear here grouped by the selected row or cell." />;
  }

  return (
    <div className="space-y-2">
      {evidence.map((source, index) => (
        <a
          key={`${source.url}-${index}`}
          className="block rounded-md border border-slate-200 p-3 hover:bg-slate-50"
          href={source.url}
          target="_blank"
          rel="noreferrer"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">{source.title}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          </span>
          <span className="mt-1 block text-xs leading-5 text-slate-600">{source.claim}</span>
        </a>
      ))}
    </div>
  );
}

function AgentTraceTab({ events }: { events: AgentEvent[] }) {
  if (!events.length) {
    return <PendingPanel icon={<Clock3 className="h-5 w-5" />} title="No trace yet" body="Agent events stream into this tab as the project runs." />;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="border-l-2 border-slate-200 pl-3">
          <p className="text-xs font-semibold text-slate-500">
            {event.agent ? agentNameByRole[event.agent] : event.company ?? "GroundTruth"}
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-700">{event.message}</p>
        </div>
      ))}
    </div>
  );
}

function PatchTab({
  row,
  onExport,
  exportDisabled,
}: {
  row: ProjectRow;
  onExport: () => void;
  exportDisabled: boolean;
}) {
  const patches = row.dataPr?.patchPreview ?? [];

  return (
    <div className="space-y-3">
      <button
        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
        disabled={exportDisabled}
        onClick={onExport}
        type="button"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export approved patch
      </button>
      {patches.length ? (
        <div className="overflow-hidden rounded-md border border-slate-200">
          {patches.map((patch) => (
            <div key={`${patch.field}-${patch.to}`} className="grid grid-cols-[100px_1fr] gap-2 border-b border-slate-100 p-2 last:border-b-0">
              <span className="text-xs font-semibold text-slate-500">{patch.field}</span>
              <span className="min-w-0 text-xs text-slate-700">
                <span className="line-through decoration-red-400">{patch.from}</span>
                <span className="mx-2 text-slate-400">to</span>
                <span className="font-semibold text-emerald-700">{patch.to}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
          No patch preview yet.
        </div>
      )}
    </div>
  );
}

function PendingPanel({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
      <div className="flex items-start gap-3">
        <span className="text-slate-400">{icon}</span>
        <div>
          <p className="font-semibold text-slate-800">{title}</p>
          <p className="mt-1 leading-6">{body}</p>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium",
        active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
