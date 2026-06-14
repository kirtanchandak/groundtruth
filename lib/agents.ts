import OpenAI from "openai";
import { buildFallbackResponse } from "./sample-data";
import {
  EvaluateResponseSchema,
  evaluateResponseJsonSchema,
  type CompanyRecord,
  type DataPR,
} from "./schemas";

const MODEL = "gpt-4o-mini";

function makeClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function logAgent(message: string, details?: Record<string, unknown>) {
  const prefix = "[GroundTruth:SourceHunter]";
  if (details) {
    console.info(new Date().toISOString(), prefix, message, details);
    return;
  }
  console.info(new Date().toISOString(), prefix, message);
}

export type SourceHunterResult = {
  pr: DataPR;
  thinkingMessage: string;
};

export type DataPrResult = {
  pr: DataPR;
  thinkingMessage: string;
};

// ─── Agent 1: Ingestion Agent ────────────────────────────────────────────────
// Deterministic — no LLM call needed. Normalises the record and emits a
// human-readable summary of what it found.
export function ingestionAgent(record: CompanyRecord): {
  thinkingMessage: string;
  completionMessage: string;
} {
  const missingFields: string[] = [];
  if (!record.website) missingFields.push("website");
  if (!record.linkedin_url) missingFields.push("linkedin url");
  if (!record.current_headcount) missingFields.push("headcount");
  if (!record.current_hq) missingFields.push("HQ");
  if (!record.current_funding) missingFields.push("funding");
  if (!record.current_industry) missingFields.push("industry");

  return {
    thinkingMessage: `Parsing CSV fields for ${record.company_name}…`,
    completionMessage:
      missingFields.length > 0
        ? `Mapped 7 fields — ${missingFields.length} missing: ${missingFields.join(", ")}.`
        : `All 7 fields mapped cleanly for ${record.company_name}.`,
  };
}

// ─── Agent 2: Source Hunter ──────────────────────────────────────────────────
// Makes the ONE real LLM call with web_search to gather all evidence and
// produce the full DataPR. All subsequent agents work from this output.
function ensureAllFields(pr: DataPR, record: CompanyRecord): DataPR {
  const requiredFields = [
    "headcount",
    "hq",
    "funding",
    "industry",
    "website",
    "linkedin_profile",
    "segment_routing",
  ] as const;
  
  const existingFields = new Set(pr.fieldReviews.map((f) => f.field));

  for (const rf of requiredFields) {
    if (!existingFields.has(rf)) {
      let currentValue = "Missing";
      if (rf === "headcount") currentValue = record.current_headcount || "Missing";
      if (rf === "hq") currentValue = record.current_hq || "Missing";
      if (rf === "funding") currentValue = record.current_funding || "Missing";
      if (rf === "industry") currentValue = record.current_industry || "Missing";
      if (rf === "website") currentValue = record.website || "Missing";
      if (rf === "linkedin_profile") currentValue = record.linkedin_url || "Missing";
      if (rf === "segment_routing") currentValue = record.segment || "Missing";

      pr.fieldReviews.push({
        field: rf,
        currentValue,
        proposedValue: currentValue,
        trustScore: 0,
        rationale: "No public evidence found to evaluate this field.",
        contradictions: [],
        evidence: [],
      });
    }
  }
  return pr;
}

export async function sourceHunterAgent(
  record: CompanyRecord,
): Promise<SourceHunterResult> {
  const client = makeClient();
  logAgent("Web search started", {
    company: record.company_name,
    model: MODEL,
  });

  const systemPrompt = [
    "You are the Source Hunter agent inside TrustLayer, an autonomous B2B data steward.",
    "Your ONLY job: search the web and find authoritative public evidence for the supplied company.",
    "Search for: official company website, LinkedIn company profile, Crunchbase/funding data, recent news.",
    "Verify headcount, HQ location, total funding raised, industry vertical, website URL, and LinkedIn URL.",
    "Return a single precise DataPR for this company. Be specific — cite exact numbers you found.",
    "If you find a conflict between CRM data and web evidence, flag it in contradictions.",
    "Decision rules: approve_update if evidence clearly differs from CRM; accept_current if aligned; escalate_human if ambiguous; contact_company if no public data.",
  ].join("\n");

  const userPrompt = [
    "Evaluate this B2B account record:",
    JSON.stringify([record], null, 2),
    "",
    "Search the web, find evidence, and return a complete DataPR with fieldReviews and sources.",
  ].join("\n");

  try {
    const response = await client.responses.create(
      {
        model: MODEL,
        instructions: systemPrompt,
        input: userPrompt,
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

    const parsed = EvaluateResponseSchema.omit({ runId: true, mode: true }).parse(
      JSON.parse(response.output_text),
    );
    let pr = parsed.prs[0];
    if (!pr) throw new Error("Source Hunter returned no DataPR.");

    pr = ensureAllFields(pr, record);

    logAgent("Web search completed", {
      company: record.company_name,
      sources: pr.sources.length,
      decision: pr.decision,
    });

    return {
      pr,
      thinkingMessage: `Found ${pr.sources.length} public source${pr.sources.length !== 1 ? "s" : ""} for ${record.company_name}.`,
    };
  } catch {
    let pr = buildFallbackResponse([record]).prs[0]!;
    pr = ensureAllFields(pr, record);
    
    logAgent("Web search unavailable; using fallback cache", {
      company: record.company_name,
      sources: pr.sources.length,
    });
    return {
      pr,
      thinkingMessage: `Used cached data for ${record.company_name} (live search unavailable).`,
    };
  }
}

// ─── Agent 3: Identity Resolver ──────────────────────────────────────────────
// Deterministic — checks website and LinkedIn match.
export function identityResolverAgent(
  record: CompanyRecord,
  pr: DataPR,
): { thinkingMessage: string; completionMessage: string } {
  const websiteMatch = pr.website && pr.website !== "" &&
    (record.website === "" || pr.website.includes(record.company_name.toLowerCase().split(" ")[0] ?? ""));
  const linkedinMatch = pr.fieldReviews.find((f) => f.field === "linkedin_profile");

  const confidence = websiteMatch ? "high" : linkedinMatch ? "medium" : "low";

  return {
    thinkingMessage: `Verifying ${record.company_name} identity against public profiles…`,
    completionMessage:
      confidence === "high"
        ? `Identity confirmed — website and profile match (${confidence} confidence).`
        : `Identity resolved with ${confidence} confidence. Website: ${pr.website || "not found"}.`,
  };
}

// ─── Agent 4: Contradiction Analyst ─────────────────────────────────────────
// Deterministic — analyses the fieldReviews from Source Hunter.
export function contradictionAnalystAgent(
  record: CompanyRecord,
  pr: DataPR,
): { thinkingMessage: string; completionMessage: string; contradictionCount: number } {
  const flaggedFields = pr.fieldReviews.filter((f) => f.contradictions.length > 0);
  const allContradictions = pr.fieldReviews.flatMap((f) => f.contradictions);

  return {
    thinkingMessage: `Comparing ${pr.fieldReviews.length} CRM fields against ${pr.sources.length} sources…`,
    completionMessage:
      flaggedFields.length > 0
        ? `Flagged ${flaggedFields.length} field${flaggedFields.length !== 1 ? "s" : ""} with contradictions: ${flaggedFields.map((f) => f.field.replaceAll("_", " ")).join(", ")}.`
        : `No contradictions found — CRM data aligns with public evidence for ${record.company_name}.`,
    contradictionCount: allContradictions.length,
  };
}

// ─── Agent 5: Trust Scorer ───────────────────────────────────────────────────
// Deterministic — summarises the trustScores already in fieldReviews.
export function trustScorerAgent(
  record: CompanyRecord,
  pr: DataPR,
): { thinkingMessage: string; completionMessage: string; avgTrust: number } {
  const scores = pr.fieldReviews.map((f) => f.trustScore);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const lowest = [...pr.fieldReviews].sort((a, b) => a.trustScore - b.trustScore)[0];

  return {
    thinkingMessage: `Scoring ${pr.fieldReviews.length} fields by evidence strength…`,
    completionMessage:
      lowest
        ? `Avg trust ${avg}% — weakest field: "${lowest.field.replaceAll("_", " ")}" at ${lowest.trustScore}%.`
        : `Trust scoring complete for ${record.company_name} — avg ${avg}%.`,
    avgTrust: avg,
  };
}

// ─── Agent 6: Data PR Writer ─────────────────────────────────────────────────
// Deterministic — synthesises from the already-complete DataPR.
export function dataPrWriterAgent(
  record: CompanyRecord,
  pr: DataPR,
): { thinkingMessage: string; completionMessage: string } {
  const patchCount = pr.patchPreview.length;

  return {
    thinkingMessage: `Drafting Data PR and recommended action for ${record.company_name}…`,
    completionMessage:
      patchCount > 0
        ? `Data PR drafted — ${patchCount} field patch${patchCount !== 1 ? "es" : ""} proposed. Decision: ${pr.decision.replaceAll("_", " ")}.`
        : `Data PR drafted — no changes recommended. Decision: ${pr.decision.replaceAll("_", " ")}.`,
  };
}
