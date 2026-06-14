"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clock3,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Fingerprint,
  GitPullRequest,
  Globe,
  Info,
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
  PlayIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import Papa from "papaparse";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { sampleRecords } from "@/lib/sample-data";
import {
  agentNameByRole,
  agentProfiles,
  type AgentEvent,
  type AgentRole,
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
  { key: "reasoning", label: "Summary" },
  { key: "evidence", label: "Evidence" },
  { key: "agent-trace", label: "Agent Trace" },
  { key: "patch", label: "Patch" },
];

const tabIcons: Record<InspectorTab, LucideIcon> = {
  "data-pr": GitPullRequest,
  "reasoning": Search,
  "evidence": ExternalLink,
  "agent-trace": Clock3,
  "patch": Download,
};

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
  queued: "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] text-zinc-500 dark:text-zinc-400",
  running: "border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
  verified: "border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  changed: "border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
  conflict: "border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400",
  failed: "border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400",
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
  const [localModeBannerDismissed, setLocalModeBannerDismissed] = useState(false);
  const activeRunScopeRef = useRef<"project" | "row" | null>(null);

  // Loading states
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [isLoadingProject, setIsLoadingProject] = useState(!!projectIdFromRoute);

  // Toast notifications state
  type Toast = {
    id: string;
    message: string;
    type: "success" | "error" | "info";
  };
  const [toasts, setToasts] = useState<Toast[]>([]);

  // CSV Preview modal states
  const [csvPreview, setCsvPreview] = useState<{
    rows: CompanyRecord[];
    filename: string;
    name: string;
  } | null>(null);
  const [previewProjectName, setPreviewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Toast helper
  const addToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4000);
  };

  const selectedRow = useMemo(() => {
    return rows.find((row) => row.id === selectedRowId) ?? null;
  }, [rows, selectedRowId]);
  const selectedCell = getCell(selectedRow, selectedField);
  const canInspect = Boolean(selectedRow);

  function resetRowForRun(row: ProjectRow): ProjectRow {
    return {
      ...row,
      status: "queued",
      progress: 0,
      dataPr: undefined,
      events: [],
      selectedDecision: undefined,
      cells: row.cells.map((cell) => ({
        ...cell,
        status: "queued",
        trustScore: undefined,
        rationale: undefined,
        contradictions: [],
        evidence: [],
        proposedValue: cell.currentValue,
      })),
    };
  }

  const projectEvents = useMemo(() => {
    const rowEvents = rows.flatMap((row) => row.events);
    return [...events, ...rowEvents].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 120);
  }, [events, rows]);
  const selectedRowEvents = useMemo(() => {
    if (!selectedRow) return projectEvents;
    return projectEvents.filter((event) => event.companyId === selectedRow.id || !event.companyId);
  }, [projectEvents, selectedRow]);

  const completedRows = rows.filter((row) => row.status === "completed").length;
  const changedCells = rows.flatMap((row) => row.cells).filter((cell) => cell.status === "changed").length;
  const conflictCells = rows.flatMap((row) => row.cells).filter((cell) => cell.status === "conflict").length;

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setIsProjectsLoading(true);
      if (projectIdFromRoute) {
        setIsLoadingProject(true);
      }

      try {
        const response = await fetch("/api/projects");
        if (!response.ok) throw new Error("Failed to fetch projects list.");
        const payload = (await response.json()) as ProjectsListResponse;
        if (cancelled) return;

        setProjects(payload.projects);
        setMode(payload.mode);

        if (projectIdFromRoute) {
          const projectResponse = await fetch(`/api/projects/${projectIdFromRoute}`);
          if (!projectResponse.ok) {
            setError(
              payload.mode === "local"
                ? "This project no longer exists — the dev server may have restarted (local mode resets all data). Choose a project from the sidebar or upload a new CSV."
                : "Project not found. Choose a project from the sidebar or upload a new CSV.",
            );
            setActiveProject(null);
            setRows([]);
            setSelectedRowId(null);
            setIsRunning(false);
            // Auto-open sidebar so the user can immediately pick another project
            setProjectsOpen(true);
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
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Could not boot application.";
          setError(msg);
          addToast(msg, "error");
        }
      } finally {
        if (!cancelled) {
          setIsProjectsLoading(false);
          setIsLoadingProject(false);
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [projectIdFromRoute]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      // Open sidebar at 768px+ (was 1024px — too restrictive)
      setProjectsOpen(window.innerWidth >= 768);
      setInspectorOpen(window.innerWidth >= 1280);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function refreshProjects(
    selectProjectId?: string,
    selectedRowIdOverride?: string | null,
    options: { preserveProjectState?: boolean } = {},
  ) {
    const response = await fetch("/api/projects");
    const payload = (await response.json()) as ProjectsListResponse;
    setProjects(payload.projects);
    setMode(payload.mode);

    const nextId = selectProjectId ?? activeProject?.id;
    if (nextId) {
      await loadProject(nextId, { selectedRowId: selectedRowIdOverride, preserveProjectState: options.preserveProjectState });
    }
  }

  function setProjectUrl(projectId: string) {
    const nextPath = `/project/${projectId}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
  }

  async function loadProject(
    projectId: string,
    options: { updateUrl?: boolean; selectedRowId?: string | null; preserveProjectState?: boolean } = {},
  ) {
    setError("");
    setIsLoadingProject(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error(`Failed to load project details (status: ${response.status})`);
      }
      const snapshot = (await response.json()) as ProjectSnapshot;
      if (options.updateUrl) setProjectUrl(projectId);
      setMode(snapshot.mode);
      if (!options.preserveProjectState) {
        setActiveProject(snapshot.project);
      }
      setRows(snapshot.rows);
      setSelectedRowId(options.selectedRowId ?? null);
      setSelectedField(null);
      setEvents([]);
      setActiveTab("data-pr");
      if (!options.preserveProjectState) {
        setIsRunning(snapshot.project.status === "running");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load project.";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setIsLoadingProject(false);
    }
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
    addToast(`Project "${snapshot.project.name}" created with ${snapshot.project.rowCount} rows!`, "success");
  }

  async function runEvaluation(projectId: string, rowId?: string) {
    const isRowRun = Boolean(rowId);
    activeRunScopeRef.current = isRowRun ? "row" : "project";
    if (!isRowRun) {
      setIsRunning(true);
    }
    setError("");
    setEvents([]);
    if (!isRowRun) {
      setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, status: "running" } : project)));
      setActiveProject((current) => (current?.id === projectId ? { ...current, status: "running" } : current));
    }
    setRows((current) =>
      current.map((row) => {
        if (row.projectId !== projectId) return row;
        if (rowId && row.id !== rowId) return row;
        return resetRowForRun(row);
      }),
    );
    if (rowId) {
      setSelectedRowId(rowId);
      setSelectedField(null);
      setActiveTab("data-pr");
      setInspectorOpen(true);
    }
    addToast(`Evaluation started for "${activeProject?.name || "project"}".`, "info");

    let hasError = false;
    try {
      const response = await fetch(`/api/projects/${projectId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rowId ? { rowId } : {}),
      });
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
      hasError = true;
      const msg = nextError instanceof Error ? nextError.message : "Could not run project.";
      setError(msg);
      setActiveProject((current) => (current?.id === projectId ? { ...current, status: "failed" } : current));
      addToast(msg, "error");
    } finally {
      activeRunScopeRef.current = null;
      if (!isRowRun) {
        setIsRunning(false);
      }
      await refreshProjects(projectId, rowId ?? null, { preserveProjectState: isRowRun });
      if (!hasError) {
        addToast(
          rowId
            ? `Row evaluation completed for "${selectedRow?.record.company_name || "row"}".`
            : `Evaluation completed for "${activeProject?.name || "project"}".`,
          "success",
        );
      }
      if (!isRowRun) {
        setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, status: "completed" } : project)));
        setActiveProject((current) =>
          current?.id === projectId ? { ...current, status: "completed", completedAt: new Date().toISOString() } : current,
        );
      }
    }
  }

  function handleStreamEvent(event: AgentEvent) {
    setEvents((current) => [event, ...current].slice(0, 120));

    if (event.type === "run_started" && activeRunScopeRef.current === "project") {
      setActiveProject((current) => (current ? { ...current, status: "running" } : current));
    }

    if (event.type === "run_completed" && activeRunScopeRef.current === "project") {
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
    addToast("Loading sample project...", "info");
    void createProjectFromRows({
      rows: sampleRecords,
      filename: "sample-b2b-accounts.csv",
      name: `Sample upload ${new Date().toLocaleTimeString()}`,
    }).catch((nextError) => {
      const msg = nextError instanceof Error ? nextError.message : "Could not load sample.";
      setError(msg);
      addToast(msg, "error");
    });
  }

  function startActiveProject() {
    if (!activeProject || isRunning) return;
    void runEvaluation(activeProject.id);
  }

  function runSelectedRow() {
    if (!selectedRow || isRunning) return;
    void runEvaluation(selectedRow.projectId, selectedRow.id);
  }

  function runSingleRow(row: ProjectRow) {
    if (isRunning) return;
    void runEvaluation(row.projectId, row.id);
  }

  function handleFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsedRows = parseCsv(String(reader.result ?? ""));
        const defaultName = file.name.replace(/\.csv$/i, "");
        setCsvPreview({
          rows: parsedRows,
          filename: file.name,
          name: defaultName,
        });
        setPreviewProjectName(defaultName);
        addToast("CSV parsed successfully! Opening preview...", "info");
      } catch (nextError) {
        const msg = nextError instanceof Error ? nextError.message : "Could not parse CSV.";
        setError(msg);
        addToast(msg, "error");
      }
    };
    reader.readAsText(file);
  }

  async function confirmCreateProject() {
    if (!csvPreview) return;
    setIsCreatingProject(true);
    try {
      await createProjectFromRows({
        rows: csvPreview.rows,
        filename: csvPreview.filename,
        name: previewProjectName.trim() || csvPreview.name,
      });
      setCsvPreview(null);
    } catch {
      const msg = "Failed to create project.";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function updateReviewerAction(row: ProjectRow, action: ReviewerAction) {
    setActions((current) => ({ ...current, [row.id]: action }));
    addToast(`Updated decision to "${reviewerText(action)}" for ${row.record.company_name}.`, "success");
    try {
      const response = await fetch(`/api/projects/${row.projectId}/rows/${row.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: action }),
      });
      if (!response.ok) throw new Error("Failed to save decision on server.");
    } catch {
      addToast("Failed to save decision to database.", "error");
    }
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
    link.download = `${activeProject?.name ?? "trustlayer"}-patch.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Boot loading state: show a full-screen spinner while fetching a project from the URL
  // Render skeleton layout instead of early return

  return (
    <main className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50">
      {projectsOpen ? (
        <button
          className="fixed inset-0 z-30 bg-zinc-950/25 dark:bg-black/40 lg:hidden"
          onClick={() => setProjectsOpen(false)}
          type="button"
          aria-label="Close projects sidebar"
        />
      ) : null}

      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] shadow-2xl transition-all duration-300 lg:static lg:z-auto lg:shadow-none overflow-hidden",
          projectsOpen 
            ? "translate-x-0 w-[300px] lg:w-[280px]" 
            : "-translate-x-full w-[300px] lg:translate-x-0 lg:w-[64px]"
        )}
      >
        <input
          ref={fileInputRef}
          className="hidden"
          accept=".csv,text/csv"
          type="file"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        {projectsOpen ? (
          <div className="flex flex-col h-full w-full min-w-[280px]">
            <div className="border-b border-zinc-200 dark:border-white/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Link href="/dashboard" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900/50">
                    <Logo size="md" />
                  </Link>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">TrustLayer</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Projects</p>
                  </div>
                </div>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5"
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
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-slate-800 disabled:bg-slate-400"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRunning}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Upload
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 dark:border-white/20 px-3 text-xs font-semibold text-slate-700 hover:bg-zinc-50 dark:hover:bg-white/5 disabled:text-zinc-400 dark:text-zinc-500"
                  onClick={runSample}
                  disabled={isRunning}
                  type="button"
                >
                  Sample
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">Recent uploads</p>
                <span className="rounded-md bg-zinc-100 dark:bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">{mode}</span>
              </div>
              <div className="space-y-2">
                {isProjectsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="w-full rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] p-3 space-y-3 animate-pulse">
                      <div className="flex items-start justify-between gap-2">
                        <div className="h-4 w-2/3 rounded bg-slate-200" />
                        <div className="h-4 w-12 rounded bg-slate-200" />
                      </div>
                      <div className="h-3 w-1/3 rounded bg-zinc-100 dark:bg-white/5" />
                      <div className="h-3 w-1/2 rounded bg-zinc-100 dark:bg-white/5" />
                    </div>
                  ))
                ) : projects.length ? (
                  projects.map((project) => (
                    <button
                      key={project.id}
                      className={cx(
                        "w-full rounded-md border p-3 text-left hover:bg-zinc-50 dark:hover:bg-white/5",
                        activeProject?.id === project.id ? "border-slate-400 bg-zinc-50 dark:bg-white/5" : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616]",
                      )}
                      onClick={() => {
                        void loadProject(project.id, { updateUrl: true });
                        if (window.innerWidth < 1024) setProjectsOpen(false);
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{project.name}</p>
                        <ProjectStatus status={project.status} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{project.rowCount} rows</p>
                      <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">{new Date(project.createdAt).toLocaleString()}</p>
                      </div>      
                    </button>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-zinc-300 dark:border-white/20 p-4 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                    <p>Upload a CSV to create your first project.</p>
                    <button
                      className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 text-xs font-semibold text-white dark:text-zinc-900 hover:bg-slate-800"
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
          </div>
        ) : (
          <div className="hidden lg:flex flex-col items-center justify-between h-full py-4 w-full min-w-[64px]">
            <div className="flex flex-col items-center gap-6 w-full">
              {/* Logo / Toggle */}
              <button
                onClick={() => setProjectsOpen(true)}
                className="group flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                title="Expand projects sidebar"
                type="button"
              >
                <Logo size="md" className="block group-hover:hidden" />
                <PanelLeftOpen className="h-5 w-5 hidden group-hover:block text-slate-700 dark:text-slate-300" />
              </button>

              <div className="h-[1px] w-8 bg-slate-200" />

              {/* Actions */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isRunning}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 dark:border-white/10 text-slate-700 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors disabled:text-slate-300"
                title="Upload CSV"
                type="button"
              >
                <Plus className="h-5 w-5" />
              </button>

              <button
                onClick={runSample}
                disabled={isRunning}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 dark:border-white/10 text-slate-700 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors disabled:text-slate-300"
                title="Run Sample Project"
                type="button"
              >
                <FileSpreadsheet className="h-5 w-5" />
              </button>

              <button
                onClick={() => void refreshProjects()}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 dark:border-white/10 text-slate-700 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                title="Refresh Projects"
                type="button"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>

            {/* Bottom Info / Expand */}
            <div className="flex flex-col items-center gap-4 w-full">
              <span 
                className="rounded bg-zinc-100 dark:bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider select-none"
                title={`Database Mode: ${mode}`}
              >
                {mode === "local" ? "LOC" : "SUP"}
              </span>
              <button
                onClick={() => setProjectsOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                title="Expand Sidebar"
                type="button"
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616]">
          <div className="flex flex-col gap-3 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Link className="inline-flex items-center gap-1 hover:text-zinc-900 dark:text-zinc-100" href="/">
                  <Logo size="sm" />
                  TrustLayer
                </Link>
                <span>/</span>
                <Link className="hover:text-zinc-900 dark:text-zinc-100" href="/dashboard">
                  All Projects
                </Link>
                {isLoadingProject ? (
                  <>
                    <span>/</span>
                    <span className="h-3 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  </>
                ) : activeProject ? (
                  <>
                    <span>/</span>
                    <span className="max-w-[160px] truncate text-zinc-800 dark:text-zinc-200">{activeProject.name}</span>
                  </>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-3">
                {activeProject && !isLoadingProject ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] px-2 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 hover:text-zinc-900 dark:text-zinc-100"
                    title="Back to all projects"
                  >
                    <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                    All Projects
                  </Link>
                ) : null}
                {isLoadingProject ? (
                  <div className="h-7 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                ) : (
                  <h1 className="truncate text-xl font-semibold">{activeProject?.name ?? "New data project"}</h1>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle />
              {activeProject ? (
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 px-3 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-400 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-600"
                  onClick={startActiveProject}
                  disabled={isRunning}
                  type="button"
                >
                  <PlayIcon className={cx("h-4 w-4", isRunning && "animate-spin")} aria-hidden="true" />
                  {activeProject.status === "completed" ? "Re-run evaluation" : "Start evaluation"}
                </button>
              ) : null}
              {canInspect ? (
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 dark:border-white/20 bg-white dark:bg-[#161616] px-3 text-sm font-medium text-slate-700 hover:bg-zinc-50 dark:hover:bg-white/5"
                  onClick={() => setInspectorOpen((current) => !current)}
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
              ) : null}
            </div>
          </div>
        </header>

        {/* Local mode info banner */}
        {mode === "local" && !localModeBannerDismissed ? (
          <div className="flex items-start justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <span>
                <strong>Local mode</strong> — project data is stored in memory and will reset when the dev server restarts. Add Supabase credentials to persist data.
              </span>
            </div>
            <button
              className="shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-100"
              onClick={() => setLocalModeBannerDismissed(true)}
              type="button"
              aria-label="Dismiss local mode notice"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
              <span>{error}</span>
            </div>
            <button
              className="shrink-0 rounded p-0.5 text-red-500 hover:bg-red-100"
              onClick={() => setError("")}
              type="button"
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div 
          className={cx(
            "grid min-h-0 flex-1 transition-all duration-300", 
            canInspect 
              ? (inspectorOpen ? "xl:grid-cols-[minmax(0,1fr)_430px]" : "xl:grid-cols-[minmax(0,1fr)_64px]") 
              : "grid-cols-1"
          )}
        >
          <section className="min-w-0 overflow-hidden">
            {isLoadingProject ? (
              <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] px-4 py-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse space-y-1">
                    <div className="h-3 w-12 rounded bg-slate-200" />
                    <div className="h-5 w-8 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : rows.length ? (
              <div className="grid grid-cols-2 gap-3 border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] px-4 py-3 md:grid-cols-4">
                <Metric label="Rows" value={String(rows.length)} />
                <Metric label="Complete" value={`${completedRows}/${rows.length || 0}`} />
                <Metric label="Changed" value={String(changedCells)} />
                <Metric label="Conflicts" value={String(conflictCells)} />
              </div>
            ) : null}

            <LiveStreamPanel
              events={selectedRow ? selectedRowEvents : projectEvents}
              isLive={isRunning || rows.some((row) => row.status === "running")}
              contextLabel={selectedRow?.record.company_name ?? activeProject?.name ?? "project"}
            />

            <div className={cx("overflow-auto", (isLoadingProject || rows.length) ? "h-[calc(100vh-168px)]" : "h-[calc(100vh-81px)]")}>
              {isLoadingProject ? (
                <table className="w-full min-w-[1420px] border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-white/5 shadow-[0_1px_0_#e2e8f0]">
                    <tr className="text-left text-xs uppercase text-zinc-500 dark:text-zinc-400">
                      <th className="sticky left-0 z-30 w-9 border-r border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-1 py-2 font-medium">
                        #
                      </th>
                      <th className="sticky left-9 z-20 min-w-[250px] border-r border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 font-medium">
                        Company
                      </th>
                      {fieldColumns.map((column) => (
                        <th key={column.key} className={cx("border-r border-zinc-200 dark:border-white/10 px-3 py-2 font-medium", column.width)}>
                          {column.label}
                        </th>
                      ))}
                      <th className="min-w-[130px] border-r border-zinc-200 dark:border-white/10 px-3 py-2 font-medium">Trust</th>
                      <th className="min-w-[150px] px-3 py-2 font-medium">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 5 }).map((_, rowIndex) => (
                      <tr key={rowIndex} className="animate-pulse">
                        <td className="sticky left-0 z-[5] border-b border-r border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] px-3 py-3">
                          <div className="space-y-1.5">
                            <div className="h-4 w-32 rounded bg-slate-200" />
                            <div className="h-3 w-20 rounded bg-zinc-100 dark:bg-white/5" />
                          </div>
                        </td>
                        {fieldColumns.map((column) => (
                          <td key={column.key} className="border-b border-r border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] px-3 py-3">
                            <div className="space-y-1.5">
                              <div className="h-3.5 w-24 rounded bg-slate-200" />
                              <div className="h-3 w-12 rounded bg-zinc-100 dark:bg-white/5" />
                            </div>
                          </td>
                        ))}
                        <td className="border-b border-r border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 rounded-full bg-zinc-100 dark:bg-white/5" />
                            <div className="h-3 w-4 rounded bg-slate-200" />
                          </div>
                        </td>
                        <td className="border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] px-3 py-3">
                          <div className="h-5 w-16 rounded bg-slate-200" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : rows.length ? (
                <table className="w-full min-w-[1420px] border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-white/5 shadow-[0_1px_0_#e2e8f0]">
                    <tr className="text-left text-xs uppercase text-zinc-500 dark:text-zinc-400">
                      <th className="sticky left-0 z-30 w-11 border-r border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-1 py-2 text-center text-[11px] font-medium uppercase tracking-wide">
                        Run
                      </th>
                      <th className="sticky left-11 z-20 min-w-[250px] border-r border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 font-medium">
                        Company
                      </th>
                      {fieldColumns.map((column) => (
                        <th key={column.key} className={cx("border-r border-zinc-200 dark:border-white/10 px-3 py-2 font-medium", column.width)}>
                          {column.label}
                        </th>
                      ))}
                      <th className="min-w-[130px] border-r border-zinc-200 dark:border-white/10 px-3 py-2 font-medium">Trust</th>
                      <th className="min-w-[150px] px-3 py-2 font-medium">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const trust = averageTrust(row);
                      const isRowSelected = selectedRow?.id === row.id;
                      return (
                        <tr
                          key={row.id}
                          className="group"
                        >
                          <td
                            className={cx(
                              "sticky left-0 z-[6] w-11 min-w-11 border-b border-r border-zinc-200 dark:border-white/10 px-1 py-1.5 transition-colors duration-150",
                              isRowSelected && !selectedField
                                ? "bg-cyan-50/50 dark:bg-zinc-800"
                                : "bg-white dark:bg-[#161616] group-hover:bg-zinc-50 dark:group-hover:bg-[#222222]"
                            )}
                          >
                            <button
                              className="mx-auto flex h-7 w-7 items-center justify-center rounded-md border border-dashed border-zinc-300 dark:border-white/10 bg-transparent text-zinc-500 dark:text-zinc-300 transition-colors duration-150 hover:border-zinc-500 dark:hover:border-zinc-400 hover:bg-zinc-900 hover:text-white dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
                              onClick={(event) => {
                                event.stopPropagation();
                                runSingleRow(row);
                              }}
                              type="button"
                              aria-label={`Run ${row.record.company_name}`}
                              title={`Run ${row.record.company_name}`}
                              disabled={isRunning || row.status === "running"}
                            >
                              {row.status === "running" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <>
                                  <span className="group-hover:hidden text-[10px] font-semibold leading-none">{row.sourceIndex + 1}</span>
                                  <PlayIcon className="hidden h-3.5 w-3.5 group-hover:inline-flex" aria-hidden="true" />
                                </>
                              )}
                            </button>
                          </td>
                          <td
                            className={cx(
                              "sticky left-11 z-[5] cursor-pointer border-b border-r border-zinc-200 dark:border-white/10 px-3 py-1.5 transition-colors duration-150",
                              isRowSelected
                                ? !selectedField
                                  ? "bg-cyan-50/50 dark:bg-zinc-800"
                                  : "bg-zinc-50 dark:bg-zinc-900"
                                : "bg-white dark:bg-[#161616] group-hover:bg-zinc-50 dark:group-hover:bg-[#222222]"
                            )}
                            onClick={() => selectRow(row.id)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-zinc-900 dark:text-zinc-100">{row.record.company_name}</p>
                                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{row.record.account_owner || "No owner"}</p>
                              </div>
                              {row.status === "running" ? <Loader2 className="h-4 w-4 animate-spin text-cyan-600" aria-hidden="true" /> : null}
                            </div>
                          </td>
                          {fieldColumns.map((column) => (
                            <td
                              key={`${row.id}-${column.key}`}
                              className={cx(
                                "border-b border-r border-zinc-200 dark:border-white/10 p-0 transition-colors duration-150",
                                isRowSelected && !selectedField
                                  ? "bg-cyan-50/30 dark:bg-zinc-800/40"
                                  : "bg-white dark:bg-[#161616]"
                              )}
                            >
                              <CellButton
                                cell={getCell(row, column.key)}
                                fallbackValue={currentValueByField[column.key](row.record)}
                                selected={isRowSelected && selectedField === column.key}
                                onClick={() => selectCell(row.id, column.key)}
                              />
                            </td>
                          ))}
                          <td
                            className={cx(
                              "border-b border-r border-zinc-200 dark:border-white/10 px-3 py-1.5 transition-colors duration-150",
                              isRowSelected && !selectedField
                                ? "bg-cyan-50/30 dark:bg-zinc-800/40"
                                : "bg-white dark:bg-[#161616] group-hover:bg-zinc-50 dark:group-hover:bg-white/5"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 rounded-full bg-zinc-100 dark:bg-white/5">
                                <div
                                  className={cx(
                                    "h-2 rounded-full",
                                    trust < 40 ? "bg-red-500" : trust < 70 ? "bg-amber-500" : "bg-emerald-500",
                                  )}
                                  style={{ width: `${trust}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{trust || "-"}</span>
                            </div>
                          </td>
                          <td
                            className={cx(
                              "border-b border-zinc-200 dark:border-white/10 px-3 py-1.5 transition-colors duration-150",
                              isRowSelected && !selectedField
                                ? "bg-cyan-50/30 dark:bg-zinc-800/40"
                                : "bg-white dark:bg-[#161616] group-hover:bg-zinc-50 dark:group-hover:bg-white/5"
                            )}
                          >
                            {row.dataPr ? (
                              <span className="rounded-md bg-zinc-100 dark:bg-white/5 px-2 py-1 text-xs font-medium text-slate-700 dark:text-zinc-300">
                                {reviewerText(actions[row.id])}
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-400 dark:text-zinc-500">Pending</span>
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
                    <div className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] p-8 shadow-sm">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
                        <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <h2 className="mt-4 text-lg font-semibold">Upload CSV</h2>
                      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                        Create a project first, then start evaluation when you are ready.
                      </p>
                      <div className="mt-5 flex justify-center gap-2">
                        <button
                          className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-slate-800"
                          onClick={() => fileInputRef.current?.click()}
                          type="button"
                        >
                          <Upload className="h-4 w-4" aria-hidden="true" />
                          Upload CSV
                        </button>
                        <button
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 dark:border-white/20 bg-white dark:bg-[#161616] px-4 text-sm font-semibold text-slate-700 hover:bg-zinc-50 dark:hover:bg-white/5"
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

          {canInspect ? (
            <>
              {/* Overlay for mobile inspector */}
              {inspectorOpen ? (
                <button
                  className="fixed inset-0 z-30 bg-zinc-950/25 dark:bg-black/40 xl:hidden"
                  onClick={() => setInspectorOpen(false)}
                  type="button"
                  aria-label="Close inspector"
                />
              ) : null}

              {/* Inspector Panel wrapper aside */}
              <aside
                className={cx(
                  "fixed inset-y-0 right-0 z-40 flex flex-col border-l border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] shadow-2xl transition-all duration-300 xl:static xl:z-auto xl:shadow-none overflow-hidden",
                  inspectorOpen
                    ? "translate-x-0 w-[min(100vw,430px)] xl:w-[430px]"
                    : "translate-x-full w-[min(100vw,430px)] xl:translate-x-0 xl:w-[64px]"
                )}
              >
                {inspectorOpen ? (
                  <Inspector
                    row={selectedRow}
                    cell={selectedCell}
                    selectedField={selectedField}
                    events={selectedRowEvents}
                    tab={activeTab}
                    onTabChange={setActiveTab}
                    action={selectedRow ? actions[selectedRow.id] : undefined}
                    onAction={(action) => selectedRow && void updateReviewerAction(selectedRow, action)}
                    onExport={exportPatch}
                    exportDisabled={!Object.values(actions).includes("approved")}
                    onRunRow={runSelectedRow}
                    isRunning={isRunning}
                    onClose={() => setInspectorOpen(false)}
                  />
                ) : (
                  <div className="hidden xl:flex flex-col items-center justify-between h-full py-4 w-full min-w-[64px]">
                    {/* Collapsed Inspector Rail */}
                    <div className="flex flex-col items-center gap-6 w-full">
                      {/* Toggle / Panel PanelRightOpen */}
                      <button
                        onClick={() => setInspectorOpen(true)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                        title="Expand Inspector"
                        type="button"
                      >
                        <PanelRightOpen className="h-5 w-5" />
                      </button>

                      <div className="h-[1px] w-8 bg-slate-200" />

                      {/* Tab Icons */}
                      {inspectorTabs.map((item) => {
                        const IconComponent = tabIcons[item.key];
                        return (
                          <button
                            key={item.key}
                            onClick={() => {
                              setActiveTab(item.key);
                              setInspectorOpen(true);
                            }}
                            className={cx(
                              "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                              activeTab === item.key
                                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"
                            )}
                            title={`Inspect: ${item.label}`}
                            type="button"
                          >
                            <IconComponent className="h-5 w-5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </aside>
            </>
          ) : null}
        </div>
      </section>

      {/* CSV Preview Modal */}
      {csvPreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-zinc-900 dark:bg-zinc-100/40 backdrop-blur-sm transition-opacity"
            onClick={() => setCsvPreview(null)}
          />

          <div className="relative z-10 flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] shadow-2xl animate-in fade-in-50 zoom-in-95 duration-200">
            <div className="border-b border-zinc-200 dark:border-white/10 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">Preview Import Data</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    File: <span className="font-semibold text-slate-700">{csvPreview.filename}</span> •{" "}
                    {csvPreview.rows.length} rows parsed
                  </p>
                </div>
                <button
                  className="rounded-md p-1.5 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-600 dark:text-zinc-300"
                  onClick={() => setCsvPreview(null)}
                  type="button"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="max-w-md space-y-1.5">
                <label htmlFor="preview-project-name" className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  Project Name
                </label>
                <input
                  id="preview-project-name"
                  type="text"
                  value={previewProjectName}
                  onChange={(e) => setPreviewProjectName(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 dark:border-white/20 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  placeholder="Enter project name"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Data preview (first 10 rows)</p>
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-white/10">
                  <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
                    <thead className="bg-zinc-50 dark:bg-white/5 border-b border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 font-semibold uppercase">
                      <tr>
                        <th className="px-4 py-3 font-medium">Company Name</th>
                        <th className="px-4 py-3 font-medium">Website</th>
                        <th className="px-4 py-3 font-medium">LinkedIn</th>
                        <th className="px-4 py-3 font-medium">Headcount</th>
                        <th className="px-4 py-3 font-medium">HQ</th>
                        <th className="px-4 py-3 font-medium">Funding</th>
                        <th className="px-4 py-3 font-medium">Industry</th>
                        <th className="px-4 py-3 font-medium">Owner</th>
                        <th className="px-4 py-3 font-medium">Segment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white dark:bg-[#161616] text-slate-700">
                      {csvPreview.rows.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-white/5">
                          <td className="px-4 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100">{row.company_name}</td>
                          <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 truncate max-w-[150px]">{row.website || "—"}</td>
                          <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 truncate max-w-[150px]">{row.linkedin_url || "—"}</td>
                          <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{row.current_headcount || "—"}</td>
                          <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{row.current_hq || "—"}</td>
                          <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{row.current_funding || "—"}</td>
                          <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{row.current_industry || "—"}</td>
                          <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{row.account_owner || "—"}</td>
                          <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{row.segment || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg bg-cyan-50/50 border border-cyan-100 p-3 text-xs text-cyan-800 flex items-start gap-2.5">
                <Info className="h-4 w-4 text-cyan-600 shrink-0 mt-0.5" />
                <span>
                  Please confirm that the columns were matched correctly. If the preview looks good, click **Create Project** to import all rows and start work.
                </span>
              </div>
            </div>

            <div className="border-t border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 px-6 py-4 flex items-center justify-end gap-3">
              <button
                className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 dark:border-white/20 bg-white dark:bg-[#161616] px-4 text-sm font-semibold text-slate-700 hover:bg-zinc-50 dark:hover:bg-white/5"
                onClick={() => setCsvPreview(null)}
                disabled={isCreatingProject}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-slate-800 disabled:bg-slate-400"
                onClick={confirmCreateProject}
                disabled={isCreatingProject}
                type="button"
              >
                {isCreatingProject ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Project...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Create Project
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Floating Toasts container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              "flex items-start gap-3 rounded-lg border bg-white dark:bg-[#161616] p-4 shadow-lg transition-all duration-300 animate-in slide-in-from-bottom-2",
              toast.type === "success" && "border-emerald-100 bg-emerald-50/50",
              toast.type === "error" && "border-red-100 bg-red-50/50",
              toast.type === "info" && "border-cyan-100 bg-cyan-50/50"
            )}
          >
            <span className="mt-0.5 shrink-0">
              {toast.type === "success" && <CircleCheck className="h-5 w-5 text-emerald-600" />}
              {toast.type === "error" && <AlertTriangle className="h-5 w-5 text-red-600" />}
              {toast.type === "info" && <Info className="h-5 w-5 text-cyan-600" />}
            </span>
            <div className="flex-1 text-sm text-slate-800 font-medium">
              {toast.message}
            </div>
            <button
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
              className="shrink-0 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:text-zinc-300"
              type="button"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

function ProjectStatus({ status }: { status: Project["status"] }) {
  const styles: Record<Project["status"], string> = {
    queued: "bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-300",
    running: "bg-cyan-50 text-cyan-700",
    completed: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
  };
  return <span className={cx("rounded-md px-2 py-1 text-[11px] font-semibold", styles[status])}>{status}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
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
        "flex min-h-10 w-full flex-col items-start justify-center gap-0.5 px-2.5 py-1.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5",
        selected
          ? "bg-cyan-50 dark:bg-zinc-800 ring-1 ring-inset ring-cyan-400 dark:ring-cyan-500"
          : "bg-transparent",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className={cx(
          "truncate text-xs font-medium",
          selected ? "text-zinc-900 dark:text-white" : "text-zinc-800 dark:text-zinc-100"
        )}>{value}</span>
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
  onRunRow,
  isRunning,
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
  onRunRow: () => void;
  isRunning: boolean;
  onClose: () => void;
}) {
  const evidence = selectedField ? cell?.evidence ?? [] : row?.cells.flatMap((item) => item.evidence) ?? [];

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,430px)] min-w-0 flex-col border-l border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] shadow-2xl xl:static xl:z-auto xl:w-auto xl:shadow-none">
      <div className="border-b border-zinc-200 dark:border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">Inspector</p>
            <h2 className="mt-1 truncate text-lg font-semibold">{row?.record.company_name ?? "No row selected"}</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {selectedField ? fieldColumns.find((field) => field.key === selectedField)?.label : "Row-level Data PR"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GitPullRequest className="h-5 w-5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5"
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

      <div className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-white/10 px-3 py-2">
        {inspectorTabs.map((item) => (
          <button
            key={item.key}
            className={cx(
              "h-8 shrink-0 rounded-md px-2.5 text-xs font-semibold",
              tab === item.key ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10",
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
              <DataPrTab row={row} action={action} onAction={onAction} onRunRow={onRunRow} isRunning={isRunning} events={events} />
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
    <div className="grid min-h-[320px] place-items-center text-center text-sm text-zinc-500 dark:text-zinc-400">
      Select a row or cell to inspect agent output.
    </div>
  );
}

function LiveStreamPanel({
  events,
  isLive,
  contextLabel,
  compact = false,
}: {
  events: AgentEvent[];
  isLive: boolean;
  contextLabel: string;
  compact?: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const liveEvents = events
    .filter((event) => ["run_started", "company_started", "agent_started", "agent_log", "field_update", "evidence_found", "data_pr_created", "company_completed", "run_completed", "run_failed"].includes(event.type))
    .slice(-8);

  const latest = liveEvents[liveEvents.length - 1];

  function eventLabel(event: AgentEvent) {
    switch (event.type) {
      case "run_started":
        return "Run started";
      case "company_started":
        return "Row started";
      case "agent_started":
        return "Agent active";
      case "agent_log":
        return "Agent update";
      case "field_update":
        return "Field scored";
      case "evidence_found":
        return "Evidence added";
      case "data_pr_created":
        return "Data PR ready";
      case "company_completed":
        return "Row completed";
      case "run_completed":
        return "Run completed";
      case "run_failed":
        return "Run failed";
      default:
        return event.type;
    }
  }

  function eventTone(event: AgentEvent) {
    switch (event.type) {
      case "run_failed":
        return "text-rose-600 dark:text-rose-400";
      case "data_pr_created":
      case "company_completed":
      case "run_completed":
        return "text-emerald-600 dark:text-emerald-400";
      case "evidence_found":
      case "field_update":
        return "text-amber-600 dark:text-amber-400";
      default:
        return "text-cyan-600 dark:text-cyan-400";
    }
  }

  function formatTime(timestamp: string) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  }

  if (!isLive && !liveEvents.length) {
    return null;
  }

  return (
    <div className="rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Loader2 className={cx("h-4 w-4 text-cyan-600", isLive && "animate-spin")} aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Live console</p>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{contextLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latest?.progress !== undefined ? (
            <span className="rounded-md bg-white dark:bg-[#161616] px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
              {Math.round(latest.progress)}%
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded p-1 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400"
            aria-label={isCollapsed ? "Expand live activity panel" : "Collapse live activity panel"}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className={cx("mt-4 rounded-md border border-zinc-200 dark:border-white/10 bg-[#0f0f0f] text-zinc-200", compact ? "max-h-[180px]" : "max-h-[280px]", "overflow-auto")}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0f0f0f]/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            <span>Timestamp</span>
            <span>Activity</span>
          </div>
          <div className="divide-y divide-white/5 font-mono text-[11px] leading-5">
            {liveEvents.length ? (
              liveEvents.map((event) => (
                <div key={event.id} className="grid grid-cols-[76px_1fr] gap-3 px-3 py-2 hover:bg-white/5">
                  <span className="text-zinc-500">{formatTime(event.timestamp)}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx("font-semibold uppercase tracking-[0.12em]", eventTone(event))}>
                        {eventLabel(event)}
                      </span>
                      {event.mode ? (
                        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-zinc-400">
                          {event.mode}
                        </span>
                      ) : null}
                      {event.agent ? (
                        <span className="text-zinc-500">{agentNameByRole[event.agent]}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 break-words text-zinc-200">
                      {event.message || "Activity event received."}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-4 text-zinc-500">Waiting for activity.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DataPrTab({
  row,
  action,
  onAction,
  onRunRow,
  isRunning,
  events,
}: {
  row: ProjectRow;
  action?: ReviewerAction;
  onAction: (action: ReviewerAction) => void;
  onRunRow: () => void;
  isRunning: boolean;
  events: AgentEvent[];
}) {
  return (
    <div className="space-y-4">
      <LiveStreamPanel
        events={events}
        isLive={isRunning || row.status === "running"}
        contextLabel={row.record.company_name}
        compact
      />

      <button
        className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 dark:border-white/20 bg-white dark:bg-[#161616] px-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 disabled:text-zinc-400"
        onClick={onRunRow}
        disabled={isRunning}
        type="button"
      >
        <PlayIcon className={cx("h-4 w-4", isRunning && "animate-spin")} aria-hidden="true" />
        {row.status === "completed" ? "Re-run row" : "Run row"}
      </button>

      {!row.dataPr ? (
        <PendingPanel icon={<Clock3 className="h-5 w-5" />} title="Data PR pending" body="The Data PR Writer will draft a recommendation when field evals complete." />
      ) : (
        <div className="rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase text-zinc-500 dark:text-zinc-400">Recommendation</p>
          <p className="mt-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50">{row.dataPr.recommendedAction}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{row.dataPr.businessImpact}</p>
          <div className="mt-3 inline-flex rounded-md bg-white dark:bg-[#161616] px-2 py-1 text-xs font-semibold text-slate-700 dark:text-zinc-300">
            {decisionLabels[row.dataPr.decision]}
          </div>
        </div>
      )}
      {row.dataPr ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ActionButton icon={<Check className="h-4 w-4" />} label="Approve" active={action === "approved"} onClick={() => onAction("approved")} />
            <ActionButton icon={<X className="h-4 w-4" />} label="Reject" active={action === "rejected"} onClick={() => onAction("rejected")} />
            <ActionButton icon={<AlertTriangle className="h-4 w-4" />} label="Escalate" active={action === "escalated"} onClick={() => onAction("escalated")} />
            <ActionButton icon={<CircleCheck className="h-4 w-4" />} label="Accept" active={action === "accepted"} onClick={() => onAction("accepted")} />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Reviewer state: {reviewerText(action)}</p>
        </>
      ) : null}
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
  const cells = selectedField && cell ? [cell] : row.cells;

  if (!cells.length) {
    return <PendingPanel icon={<Search className="h-5 w-5" />} title="Field summary pending" body="Click a running or completed cell to inspect the current value, proposed value, and trust level." />;
  }

  return (
    <div className="space-y-3">
      {cells.map((item) => (
        <div key={item.id} className="rounded-md border border-zinc-200 dark:border-white/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold capitalize">{item.fieldKey.replaceAll("_", " ")}</p>
            <span className={cx("rounded-md border px-2 py-1 text-xs font-semibold", statusStyle[item.status])}>{item.status}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] p-2">
              <p className="text-[11px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">Current</p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{item.currentValue || "—"}</p>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] p-2">
              <p className="text-[11px] font-semibold uppercase text-zinc-500 dark:text-zinc-400">Proposed</p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">{item.proposedValue || "—"}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-zinc-100 dark:bg-white/10 px-2 py-1 font-semibold text-zinc-700 dark:text-zinc-200">
              Trust {item.trustScore ?? 0}%
            </span>
            <span className="rounded-md bg-zinc-100 dark:bg-white/10 px-2 py-1 font-semibold text-zinc-700 dark:text-zinc-200">
              Evidence {item.evidence.length}
            </span>
            <span className="rounded-md bg-zinc-100 dark:bg-white/10 px-2 py-1 font-semibold text-zinc-700 dark:text-zinc-200">
              Contradictions {item.contradictions.length}
            </span>
          </div>
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
          className="block rounded-md border border-zinc-200 dark:border-white/10 p-3 hover:bg-zinc-50 dark:hover:bg-white/5"
          href={source.url}
          target="_blank"
          rel="noreferrer"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{source.title}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
          </span>
          <span className="mt-1 block text-xs leading-5 text-zinc-600 dark:text-zinc-300">{source.claim}</span>
        </a>
      ))}
    </div>
  );
}

// Maps agent role → lucide icon component
const agentIconMap: Record<AgentRole, LucideIcon> = {
  ingestion: FileSpreadsheet,
  source_hunter: Globe,
  identity_resolver: Fingerprint,
  contradiction_analyst: AlertTriangle,
  trust_scorer: ShieldCheck,
  data_pr_writer: GitPullRequest,
};

// Maps agent role → color token for theming
const agentColorMap: Record<AgentRole, { dot: string; ring: string; bg: string; text: string; border: string }> = {
  ingestion:           { dot: "bg-zinc-400",    ring: "ring-zinc-400",    bg: "bg-zinc-50 dark:bg-zinc-800/60",    text: "text-zinc-600 dark:text-zinc-300",    border: "border-zinc-200 dark:border-zinc-700" },
  source_hunter:       { dot: "bg-blue-500",    ring: "ring-blue-500",    bg: "bg-blue-50 dark:bg-blue-900/20",    text: "text-blue-700 dark:text-blue-300",    border: "border-blue-200 dark:border-blue-700/50" },
  identity_resolver:   { dot: "bg-violet-500",  ring: "ring-violet-500",  bg: "bg-violet-50 dark:bg-violet-900/20",  text: "text-violet-700 dark:text-violet-300",  border: "border-violet-200 dark:border-violet-700/50" },
  contradiction_analyst: { dot: "bg-amber-500", ring: "ring-amber-500",   bg: "bg-amber-50 dark:bg-amber-900/20",  text: "text-amber-700 dark:text-amber-300",  border: "border-amber-200 dark:border-amber-700/50" },
  trust_scorer:        { dot: "bg-emerald-500", ring: "ring-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-700/50" },
  data_pr_writer:      { dot: "bg-rose-500",    ring: "ring-rose-500",    bg: "bg-rose-50 dark:bg-rose-900/20",    text: "text-rose-700 dark:text-rose-300",    border: "border-rose-200 dark:border-rose-700/50" },
};

function AgentTraceTab({ events }: { events: AgentEvent[] }) {
  if (!events.length) {
    return (
      <PendingPanel
        icon={<Clock3 className="h-5 w-5" />}
        title="Pipeline not started"
        body="Run this row to see all 6 agents work through it step by step."
      />
    );
  }

  const chronologicalEvents = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Derive per-agent state from events
  const agentSequence: AgentRole[] = [
    "ingestion",
    "source_hunter",
    "identity_resolver",
    "contradiction_analyst",
    "trust_scorer",
    "data_pr_writer",
  ];

  type AgentStatus = "pending" | "running" | "done";
  const agentState: Record<AgentRole, { status: AgentStatus; completionMsg: string; thinkingMsg: string }> = {
    ingestion:             { status: "pending", completionMsg: "", thinkingMsg: "" },
    source_hunter:         { status: "pending", completionMsg: "", thinkingMsg: "" },
    identity_resolver:     { status: "pending", completionMsg: "", thinkingMsg: "" },
    contradiction_analyst: { status: "pending", completionMsg: "", thinkingMsg: "" },
    trust_scorer:          { status: "pending", completionMsg: "", thinkingMsg: "" },
    data_pr_writer:        { status: "pending", completionMsg: "", thinkingMsg: "" },
  };

  // Walk events in order to build state
  for (const evt of chronologicalEvents) {
    if (!evt.agent) continue;
    const role = evt.agent;
    if (evt.type === "agent_started") {
      agentState[role].status = "running";
      if (evt.message) agentState[role].thinkingMsg = evt.message;
    }
    if (evt.type === "agent_log") {
      agentState[role].status = "done";
      if (evt.message) agentState[role].completionMsg = evt.message;
    }
  }

  // Evidence and field-update counts
  const evidenceCount = chronologicalEvents.filter((e) => e.type === "evidence_found").length;
  const fieldCount = chronologicalEvents.filter((e) => e.type === "field_update").length;
  const isRunComplete = chronologicalEvents.some((e) => e.type === "company_completed" || e.type === "data_pr_created");

  return (
    <div className="space-y-4">
      {/* ── Pipeline header ── */}
      <div className="flex items-center gap-2">
        <div className={cx(
          "h-2 w-2 rounded-full",
          isRunComplete ? "bg-emerald-500" : agentSequence.some((r) => agentState[r].status === "running") ? "bg-cyan-500 animate-pulse" : "bg-zinc-300 dark:bg-zinc-600"
        )} />
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {isRunComplete ? "Pipeline complete" : agentSequence.some((r) => agentState[r].status === "running") ? "Pipeline running…" : "Pipeline queued"}
        </p>
        {(evidenceCount > 0 || fieldCount > 0) && (
          <div className="ml-auto flex items-center gap-2 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
            {evidenceCount > 0 && <span>{evidenceCount} sources</span>}
            {fieldCount > 0 && <span>{fieldCount} fields scored</span>}
          </div>
        )}
      </div>

      {/* ── Agent steps ── */}
      <div className="space-y-2">
        {agentSequence.map((role) => {
          const profile = agentProfiles.find((p) => p.role === role)!;
          const state = agentState[role];
          const colors = agentColorMap[role];
          const Icon = agentIconMap[role];
          const isActive = state.status === "running";
          const isDone = state.status === "done";
          const isPending = state.status === "pending";

          return (
            <div
              key={role}
              className={cx(
                "rounded-lg border p-3 transition-all duration-300",
                isActive ? cx("border-2", colors.border, colors.bg) : isDone ? cx("border", colors.border, colors.bg, "opacity-90") : "border-zinc-100 dark:border-white/5 opacity-40"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cx(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  isDone || isActive ? colors.bg : "bg-zinc-100 dark:bg-white/5",
                  isActive && cx("ring-2", colors.ring)
                )}>
                  {isActive ? (
                    <Loader2 className={cx("h-4 w-4 animate-spin", colors.text)} />
                  ) : isDone ? (
                    <Icon className={cx("h-4 w-4", colors.text)} />
                  ) : (
                    <Icon className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cx(
                      "text-xs font-semibold",
                      isDone || isActive ? colors.text : "text-zinc-400 dark:text-zinc-600"
                    )}>
                      {profile.name}
                    </p>
                    {isDone && (
                      <span className={cx("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", colors.bg, colors.text)}>
                        done
                      </span>
                    )}
                    {isActive && (
                      <span className="shrink-0 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-500 animate-pulse">
                        running
                      </span>
                    )}
                  </div>

                  {/* Message */}
                  {isActive && state.thinkingMsg && (
                    <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                      {state.thinkingMsg}
                    </p>
                  )}
                  {isDone && state.completionMsg && (
                    <p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                      {state.completionMsg}
                    </p>
                  )}
                  {isPending && (
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
                      {profile.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
        className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 dark:border-white/20 bg-white dark:bg-[#161616] px-3 text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 disabled:text-zinc-400 dark:disabled:text-zinc-500"
        disabled={exportDisabled}
        onClick={onExport}
        type="button"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export approved patch
      </button>
      {patches.length ? (
        <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-white/10">
          {patches.map((patch) => (
            <div key={`${patch.field}-${patch.to}`} className="grid grid-cols-[100px_1fr] gap-2 border-b border-slate-100 p-2 last:border-b-0">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{patch.field}</span>
              <span className="min-w-0 text-xs text-slate-700 dark:text-zinc-300">
                <span className="line-through decoration-red-400">{patch.from}</span>
                <span className="mx-2 text-zinc-400 dark:text-zinc-500">to</span>
                <span className="font-semibold text-emerald-700">{patch.to}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 p-3 text-sm text-zinc-500 dark:text-zinc-400">
          No patch preview yet.
        </div>
      )}
    </div>
  );
}

function PendingPanel({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 dark:border-white/20 bg-zinc-50 dark:bg-white/5 p-4 text-sm text-zinc-600 dark:text-zinc-300">
      <div className="flex items-start gap-3">
        <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>
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
        active ? "border-slate-950 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "border-zinc-300 dark:border-white/20 bg-white dark:bg-[#161616] text-slate-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
