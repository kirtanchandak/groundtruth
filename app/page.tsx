import {
  ArrowRight,
  CheckCircle2,
  DatabaseZap,
  FileSearch,
  GitPullRequest,
  Network,
  Radar,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

const valueProps: Array<[string, string, LucideIcon]> = [
  ["Ingest", "Map CSV columns and validate each company record.", DatabaseZap],
  ["Investigate", "Search public evidence and resolve the account identity.", FileSearch],
  ["Decide", "Score trust, flag contradictions, and draft the patch.", GitPullRequest],
];

const agentStages = [
  "Ingestion Agent",
  "Source Hunter",
  "Identity Resolver",
  "Contradiction Analyst",
  "Trust Scorer",
  "Data PR Writer",
];

const proofRows = [
  { company: "HubSpot", change: "Segment SMB to Enterprise", score: "16", status: "Critical" },
  { company: "Stripe", change: "Funding requires review", score: "45", status: "Review" },
  { company: "Notion", change: "No patch needed", score: "91", status: "Verified" },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f4f1ea] text-[#111827]">
      <section className="relative min-h-screen overflow-hidden bg-[#111827] text-white">
        <div className="absolute inset-0 opacity-90">
          <div className="absolute inset-0 bg-[linear-gradient(120deg,#111827_0%,#1f2937_42%,#0f766e_100%)]" />
          <div className="absolute inset-x-0 top-0 h-px bg-cyan-200/40" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.16),transparent_28%),radial-gradient(circle_at_80%_15%,rgba(16,185,129,0.12),transparent_22%),linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:auto,auto,48px_48px,48px_48px]" />
        </div>

        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-slate-950">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">GroundTruth</p>
              <p className="text-xs text-white/60">Enterprise data evals</p>
            </div>
          </div>
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-md border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur hover:bg-white/15"
            href="/dashboard"
          >
            Open Dashboard
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-82px)] max-w-7xl items-center gap-10 px-5 pb-12 sm:px-8 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="max-w-3xl py-12">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 text-sm text-cyan-100">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Autonomous Evals for Enterprise Data
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-normal text-white sm:text-7xl">
              Upload CRM data. Watch agents verify every record.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
              GroundTruth turns stale B2B records into evidence-backed Data PRs: public sources, contradictions,
              trust scores, business impact, and the recommended action for every account.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-slate-950 hover:bg-cyan-50"
                href="/dashboard"
              >
                Open Dashboard
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/10"
                href="#pipeline"
              >
                See agent pipeline
              </a>
            </div>
          </div>

          <div className="relative min-h-[560px]">
            <div className="absolute inset-0 rounded-md border border-white/15 bg-white/[0.06] shadow-2xl backdrop-blur-xl" />
            <div className="absolute inset-4 overflow-hidden rounded-md border border-white/15 bg-[#0b1220]/92">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-white">Live Eval Run</p>
                  <p className="text-xs text-slate-400">6 agents verifying 5 enterprise records</p>
                </div>
                <span className="rounded-md bg-emerald-400/12 px-2 py-1 text-xs font-semibold text-emerald-200">
                  streaming
                </span>
              </div>

              <div className="grid gap-4 p-5 xl:grid-cols-[1fr_260px]">
                <div className="space-y-3">
                  {proofRows.map((row) => (
                    <div key={row.company} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{row.company}</p>
                          <p className="mt-1 text-xs text-slate-400">{row.change}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-semibold text-white">{row.score}</p>
                          <p className="text-[11px] uppercase text-slate-500">trust</p>
                        </div>
                      </div>
                      <div className="mt-4 h-1.5 rounded-full bg-white/10">
                        <div
                          className="h-1.5 rounded-full bg-cyan-300"
                          style={{ width: `${Math.max(Number(row.score), 28)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Agent pipeline</p>
                  <div className="mt-4 space-y-3">
                    {agentStages.map((stage, index) => (
                      <div key={stage} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-300/10 text-xs font-semibold text-cyan-100">
                          {index + 1}
                        </span>
                        <span className="text-xs text-slate-200">{stage}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mx-5 mb-5 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4">
                <div className="flex items-start gap-3">
                  <GitPullRequest className="mt-0.5 h-5 w-5 text-emerald-200" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-white">Data PR ready</p>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      Update HubSpot segment from SMB to Enterprise. Public-company scale changes routing and
                      account ownership.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pipeline" className="border-b border-slate-200 bg-[#f4f1ea] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase text-teal-700">Agent-native workflow</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950">
              Six specialized agents. One approval-ready Data PR.
            </h2>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {valueProps.map(([title, body, Icon]) => (
              <div key={String(title)} className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
                <Icon className="h-6 w-6 text-teal-700" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase text-teal-700">Enterprise control</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950">
              Evals that explain the business consequence of bad data.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              GroundTruth does not stop at enrichment. It shows which records are safe to patch, which need
              human review, and how the change affects GTM routing.
            </p>
            <div className="mt-6 space-y-3 text-sm text-slate-700">
              {["Evidence-backed source trail", "Field-level trust scores", "Contradiction detection", "Exportable CRM patch"].map(
                (item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    {item}
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-[#f8fafc] p-5">
              <Radar className="h-5 w-5 text-teal-700" aria-hidden="true" />
              <p className="mt-4 text-sm font-semibold text-slate-950">Real-time research</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                See each agent search, resolve, compare, score, and draft as the table updates.
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-[#f8fafc] p-5">
              <Network className="h-5 w-5 text-teal-700" aria-hidden="true" />
              <p className="mt-4 text-sm font-semibold text-slate-950">Source consensus</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Public evidence is grouped by field so contradictions are visible before approval.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
