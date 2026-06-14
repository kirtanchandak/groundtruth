import {
  ArrowRight,
  GitPullRequest,
  Search,
  ShieldCheck,
  Upload,
  AlertTriangle,
  Database,
  RefreshCw
} from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";

const liveAuditRows = [
  {
    company: "Zepto",
    employees: { value: "350", sub: "LinkedIn shows 1,200+", status: "red" },
    funding: { value: "$200M", status: "green" },
    hq: { value: "Mumbai", status: "green" },
    trust: 38,
  },
  {
    company: "Groww",
    employees: { value: "800", sub: "Conflicting sources", status: "yellow" },
    funding: { value: "$251M", status: "green" },
    hq: { value: "Bangalore", status: "green" },
    trust: 61,
  },
  {
    company: "Darwinbox",
    employees: { value: "1,100", sub: null, status: "green" },
    funding: { value: "$72M", status: "green" },
    hq: { value: "Hyderabad", status: "green" },
    trust: 89,
  },
  {
    company: "Oxyzo",
    employees: { value: "—", sub: "No public data found", status: "gray" },
    funding: { value: "$200M", sub: "Unverified", status: "yellow" },
    hq: { value: "Gurugram", status: "green" },
    trust: 29,
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-50">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Logo size="md" />
          <p className="text-lg font-bold tracking-tight">TrustLayer</p>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            href="/dashboard"
          >
            Dashboard
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center lg:px-8 lg:pt-32 lg:pb-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400 mb-8">
          <ShieldCheck className="h-4 w-4" />
          AI Data Steward
        </div>
        
        <h1 className="text-5xl font-bold tracking-tight text-zinc-900 sm:text-7xl dark:text-white">
          Your database is lying.
          <br />
          <span className="text-rose-600 dark:text-rose-400">You just don&apos;t know which parts.</span>
        </h1>
        
        <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          TrustLayer continuously audits enterprise databases, detects
          contradictions, assigns trust scores, and automatically packages
          verified updates to sync directly with your CRM.
        </p>
        
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 dark:border dark:border-white/10 dark:hover:bg-zinc-700"
          >
            <Upload className="h-4 w-4" />
            Upload your database
          </Link>
          <Link
            href="#live-demo"
            className="inline-flex h-12 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-6 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/5"
          >
            See live demo
          </Link>
        </div>

        {/* Metric Cards */}
        <div className="mt-20 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-8 dark:border-white/10 dark:bg-[#1a1a1a]">
            <p className="text-4xl font-bold text-rose-600 dark:text-rose-400">43%</p>
            <p className="mt-2 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
              avg fields unverified in<br />B2B databases
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-8 dark:border-white/10 dark:bg-[#1a1a1a]">
            <p className="text-4xl font-bold text-zinc-900 dark:text-white">3 agents</p>
            <p className="mt-2 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
              audit → research →<br />CRM patch
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-8 dark:border-white/10 dark:bg-[#1a1a1a]">
            <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-500">91%</p>
            <p className="mt-2 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
              avg confidence after<br />TrustLayer
            </p>
          </div>
        </div>
      </section>

      <section id="live-demo" className="mx-auto max-w-5xl px-6 pb-24 pt-12 lg:px-8">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Live Audit — 8 Companies
          </p>
        </div>

        {/* Live Audit Table Container */}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/50 dark:border-white/10 dark:bg-[#161616]">
          {/* Table Header */}
          <div className="grid grid-cols-5 items-center gap-4 border-b border-zinc-200 px-6 py-4 text-sm font-medium text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            <div>Company</div>
            <div>Employees</div>
            <div>Funding</div>
            <div>HQ</div>
            <div className="text-right">Trust</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-zinc-200 dark:divide-white/5">
            {liveAuditRows.map((row) => (
              <div key={row.company} className="grid grid-cols-5 items-center gap-4 px-6 py-4">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">{row.company}</div>
                
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        row.employees.status === "red"
                          ? "bg-rose-500"
                          : row.employees.status === "yellow"
                          ? "bg-amber-500"
                          : row.employees.status === "green"
                          ? "bg-emerald-500"
                          : "bg-zinc-500 dark:bg-zinc-600"
                      }`}
                    />
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">{row.employees.value}</span>
                  </div>
                  {row.employees.sub && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{row.employees.sub}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        row.funding.status === "red"
                          ? "bg-rose-500"
                          : row.funding.status === "yellow"
                          ? "bg-amber-500"
                          : row.funding.status === "green"
                          ? "bg-emerald-500"
                          : "bg-zinc-500"
                      }`}
                    />
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">{row.funding.value}</span>
                  </div>
                  {row.funding.sub && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{row.funding.sub}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        row.hq.status === "red"
                          ? "bg-rose-500"
                          : row.hq.status === "yellow"
                          ? "bg-amber-500"
                          : row.hq.status === "green"
                          ? "bg-emerald-500"
                          : "bg-zinc-500"
                      }`}
                    />
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">{row.hq.value}</span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      row.trust < 40
                        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400"
                        : row.trust < 70
                        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                    }`}
                  >
                    {row.trust}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CRM Sync Patch Box */}
        <div className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/10 dark:bg-[#1c1c1c]">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <GitPullRequest className="h-4 w-4" />
            CRM Patch Staged — Zepto headcount (trust score: 91%)
          </div>
          
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-700 dark:border-white/10 dark:bg-[#222] dark:text-zinc-300">
            <p className="mb-4 font-semibold text-zinc-900 dark:text-zinc-100">Action: Sync data update to HubSpot CRM</p>
            <div className="space-y-2 mb-6">
              <div className="flex justify-between border-b border-zinc-100 dark:border-white/5 py-2">
                <span className="text-zinc-500">Field</span>
                <span className="font-mono text-zinc-900 dark:text-zinc-100">headcount</span>
              </div>
              <div className="flex justify-between border-b border-zinc-100 dark:border-white/5 py-2">
                <span className="text-zinc-500">Current Value</span>
                <span className="font-medium text-rose-500 line-through">350</span>
              </div>
              <div className="flex justify-between border-b border-zinc-100 dark:border-white/5 py-2">
                <span className="text-zinc-500">Verified Value</span>
                <span className="font-medium text-emerald-500">1,200+</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-zinc-500">Source Evidence</span>
                <span className="text-zinc-500 text-right">LinkedIn Profile, Zepto Press Kit</span>
              </div>
            </div>
            <button className="w-full inline-flex items-center justify-center h-10 px-4 rounded bg-zinc-900 text-white font-semibold text-xs transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200" disabled>
              Apply Patch to CRM
            </button>
          </div>
        </div>

        {/* Agent Pipeline */}
        <div className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Agent Pipeline
          </p>
          
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-zinc-700 dark:border-white/10 dark:bg-[#1c1c1c] dark:text-zinc-300">
              <Search className="h-4 w-4 text-zinc-400" />
              Auditor agent — flags suspicious fields
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-zinc-700 dark:border-white/10 dark:bg-[#1c1c1c] dark:text-zinc-300">
              <Database className="h-4 w-4 text-zinc-400" />
              Researcher agent — scores + reasons
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600" />
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-zinc-700 dark:border-white/10 dark:bg-[#1c1c1c] dark:text-zinc-300">
              <RefreshCw className="h-4 w-4 text-zinc-400" />
              Integration agent — stages CRM patches
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-[#1c1c1c]">
            <ShieldCheck className="mb-4 h-5 w-5 text-zinc-900 dark:text-zinc-100" />
            <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Per-field trust scores</h3>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Every field gets a 0-100 score with a one-line reasoning chain — not just generic quality scores.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-[#1c1c1c]">
            <AlertTriangle className="mb-4 h-5 w-5 text-zinc-900 dark:text-zinc-100" />
            <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Contradiction detection</h3>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Agents automatically search public records, documents, and news to flag conflicting values.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-[#1c1c1c]">
            <RefreshCw className="mb-4 h-5 w-5 text-zinc-900 dark:text-zinc-100" />
            <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">1-Click CRM Sync</h3>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Once research agent verifies a field, push direct data patches back into Salesforce, HubSpot, or Snowflake.
            </p>
          </div>
        </div>

        {/* Bottom Tagline */}
        <div className="mt-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
            Every other tool tells you what the data is.
            <br />
            <span className="text-rose-600 dark:text-rose-400">TrustLayer tells you whether to believe it.</span>
          </h2>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-white/10 mt-32 py-12 bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-auto max-w-5xl px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="font-semibold text-zinc-900 dark:text-white">TrustLayer</span>
          </div>
          <p>© {new Date().getFullYear()} TrustLayer Inc. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/dashboard" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Dashboard</Link>
            <a href="#" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
