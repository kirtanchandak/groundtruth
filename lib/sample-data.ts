import type { CompanyRecord, DataPR, EvaluateResponse } from "./schemas";

export const sampleRecords: CompanyRecord[] = [
  {
    id: "row-zoho",
    company_name: "Zoho",
    website: "https://www.zoho.com",
    linkedin_url: "https://www.linkedin.com/company/zoho",
    current_headcount: "4,500",
    current_hq: "Pune, India",
    current_funding: "Bootstrapped",
    current_industry: "CRM software",
    account_owner: "Aarav Mehta",
    segment: "Mid-Market",
  },
  {
    id: "row-freshworks",
    company_name: "Freshworks",
    website: "https://www.freshworks.com",
    linkedin_url: "https://www.linkedin.com/company/freshworks-inc",
    current_headcount: "2,200",
    current_hq: "Chennai, India",
    current_funding: "Public",
    current_industry: "Customer support software",
    account_owner: "Nisha Rao",
    segment: "Mid-Market",
  },
  {
    id: "row-hubspot",
    company_name: "HubSpot",
    website: "https://www.hubspot.com",
    linkedin_url: "https://www.linkedin.com/company/hubspot",
    current_headcount: "3,000",
    current_hq: "Boston, MA",
    current_funding: "Public",
    current_industry: "Marketing automation",
    account_owner: "Mira Shah",
    segment: "SMB",
  },
  {
    id: "row-stripe",
    company_name: "Stripe",
    website: "https://stripe.com",
    linkedin_url: "https://www.linkedin.com/company/stripe",
    current_headcount: "7,000",
    current_hq: "San Francisco, CA",
    current_funding: "$6.5B",
    current_industry: "Payments",
    account_owner: "Kabir Sen",
    segment: "Enterprise",
  },
  {
    id: "row-notion",
    company_name: "Notion",
    website: "https://www.notion.so",
    linkedin_url: "https://www.linkedin.com/company/notionhq",
    current_headcount: "600",
    current_hq: "San Francisco, CA",
    current_funding: "$343M",
    current_industry: "Productivity software",
    account_owner: "Leah Kapoor",
    segment: "Mid-Market",
  },
];

export const sampleCsv = [
  "company_name,website,linkedin_url,current_headcount,current_hq,current_funding,current_industry,account_owner,segment",
  ...sampleRecords.map((record) =>
    [
      record.company_name,
      record.website,
      record.linkedin_url,
      record.current_headcount,
      record.current_hq,
      record.current_funding,
      record.current_industry,
      record.account_owner,
      record.segment,
    ]
      .map((value) => `"${value.replaceAll('"', '""')}"`)
      .join(","),
  ),
].join("\n");

const evidence = (
  title: string,
  url: string,
  sourceType: "website" | "linkedin" | "news" | "database" | "filing" | "other",
  claim: string,
) => ({ title, url, sourceType, claim });

const fallbackByCompany: Record<string, DataPR> = {
  zoho: {
    id: "pr-zoho",
    company: "Zoho",
    website: "https://www.zoho.com",
    owner: "Aarav Mehta",
    segment: "Mid-Market",
    decision: "approve_update",
    priority: "critical",
    recommendedAction: "Update HQ to Chennai and move the account into Enterprise routing.",
    businessImpact:
      "The stale HQ and segment keep Zoho in the wrong territory and understate enterprise coverage needs.",
    patchPreview: [
      { field: "current_hq", from: "Pune, India", to: "Chennai, India" },
      { field: "segment", from: "Mid-Market", to: "Enterprise" },
      { field: "current_headcount", from: "4,500", to: "15,000+" },
    ],
    fieldReviews: [
      {
        field: "headcount",
        currentValue: "4,500",
        proposedValue: "15,000+",
        trustScore: 18,
        rationale: "Multiple public profiles describe Zoho as far larger than the CRM record.",
        contradictions: ["CRM headcount appears materially stale versus company-scale signals."],
        evidence: [
          evidence("Zoho company site", "https://www.zoho.com/aboutus.html", "website", "Zoho describes a global operating footprint."),
          evidence("Zoho LinkedIn", "https://www.linkedin.com/company/zoho", "linkedin", "LinkedIn profile indicates a much larger workforce range."),
        ],
      },
      {
        field: "hq",
        currentValue: "Pune, India",
        proposedValue: "Chennai, India",
        trustScore: 24,
        rationale: "Public company material points to Chennai as the primary India headquarters.",
        contradictions: ["Current CRM HQ conflicts with public company profile data."],
        evidence: [
          evidence("Zoho about page", "https://www.zoho.com/aboutus.html", "website", "Company profile references Chennai-area operations."),
        ],
      },
      {
        field: "segment_routing",
        currentValue: "Mid-Market",
        proposedValue: "Enterprise",
        trustScore: 31,
        rationale: "Headcount and global footprint should route this account to enterprise coverage.",
        contradictions: [],
        evidence: [
          evidence("Zoho website", "https://www.zoho.com", "website", "Product breadth and global footprint suggest enterprise-grade account handling."),
        ],
      },
    ],
    sources: [
      evidence("Zoho company site", "https://www.zoho.com/aboutus.html", "website", "Company-scale evidence."),
      evidence("Zoho LinkedIn", "https://www.linkedin.com/company/zoho", "linkedin", "Workforce evidence."),
    ],
  },
  freshworks: {
    id: "pr-freshworks",
    company: "Freshworks",
    website: "https://www.freshworks.com",
    owner: "Nisha Rao",
    segment: "Mid-Market",
    decision: "approve_update",
    priority: "critical",
    recommendedAction: "Update headcount and route Freshworks as an Enterprise account.",
    businessImpact:
      "Understated headcount suppresses account priority and may keep enterprise expansion motions from firing.",
    patchPreview: [
      { field: "current_headcount", from: "2,200", to: "5,000+" },
      { field: "segment", from: "Mid-Market", to: "Enterprise" },
    ],
    fieldReviews: [
      {
        field: "headcount",
        currentValue: "2,200",
        proposedValue: "5,000+",
        trustScore: 22,
        rationale: "Public company profile and hiring footprint indicate the CRM value is stale.",
        contradictions: [],
        evidence: [
          evidence("Freshworks company site", "https://www.freshworks.com/company/about/", "website", "Freshworks presents itself as a global public SaaS company."),
          evidence("Freshworks LinkedIn", "https://www.linkedin.com/company/freshworks-inc", "linkedin", "LinkedIn indicates a larger employee band than the CRM row."),
        ],
      },
      {
        field: "industry",
        currentValue: "Customer support software",
        proposedValue: "Customer engagement SaaS",
        trustScore: 61,
        rationale: "The current value is directionally right but too narrow for routing and segmentation.",
        contradictions: [],
        evidence: [
          evidence("Freshworks products", "https://www.freshworks.com", "website", "Freshworks spans support, sales, IT, and customer engagement products."),
        ],
      },
      {
        field: "hq",
        currentValue: "Chennai, India",
        proposedValue: "San Mateo, CA / Chennai, India",
        trustScore: 57,
        rationale: "Public profiles split corporate and operational headquarters, so keep a human-visible nuance.",
        contradictions: ["Sources may use different HQ conventions across corporate and India operations."],
        evidence: [
          evidence("Freshworks investor profile", "https://ir.freshworks.com", "filing", "Public-company materials use US corporate context."),
        ],
      },
    ],
    sources: [
      evidence("Freshworks site", "https://www.freshworks.com/company/about/", "website", "Company profile."),
      evidence("Freshworks LinkedIn", "https://www.linkedin.com/company/freshworks-inc", "linkedin", "Workforce profile."),
    ],
  },
  hubspot: {
    id: "pr-hubspot",
    company: "HubSpot",
    website: "https://www.hubspot.com",
    owner: "Mira Shah",
    segment: "SMB",
    decision: "approve_update",
    priority: "critical",
    recommendedAction: "Update segment from SMB to Enterprise and refresh headcount.",
    businessImpact:
      "The record is being routed to SMB coverage despite public-company scale and enterprise buying complexity.",
    patchPreview: [
      { field: "current_headcount", from: "3,000", to: "8,000+" },
      { field: "segment", from: "SMB", to: "Enterprise" },
    ],
    fieldReviews: [
      {
        field: "headcount",
        currentValue: "3,000",
        proposedValue: "8,000+",
        trustScore: 16,
        rationale: "The CRM value significantly understates current public-company scale.",
        contradictions: [],
        evidence: [
          evidence("HubSpot company page", "https://www.hubspot.com/company", "website", "Company page signals a large global workforce and customer base."),
          evidence("HubSpot LinkedIn", "https://www.linkedin.com/company/hubspot", "linkedin", "LinkedIn workforce range exceeds the CRM value."),
        ],
      },
      {
        field: "segment_routing",
        currentValue: "SMB",
        proposedValue: "Enterprise",
        trustScore: 20,
        rationale: "Company size and public status make SMB routing unsafe.",
        contradictions: [],
        evidence: [
          evidence("HubSpot investor relations", "https://ir.hubspot.com", "filing", "Public-company status supports enterprise routing."),
        ],
      },
      {
        field: "hq",
        currentValue: "Boston, MA",
        proposedValue: "Cambridge, MA",
        trustScore: 64,
        rationale: "The current value is close enough for territory handling but should be normalized.",
        contradictions: [],
        evidence: [
          evidence("HubSpot company page", "https://www.hubspot.com/company", "website", "HubSpot commonly lists Cambridge, Massachusetts in company profiles."),
        ],
      },
    ],
    sources: [
      evidence("HubSpot company page", "https://www.hubspot.com/company", "website", "Company profile."),
      evidence("HubSpot investor relations", "https://ir.hubspot.com", "filing", "Public-company context."),
    ],
  },
  stripe: {
    id: "pr-stripe",
    company: "Stripe",
    website: "https://stripe.com",
    owner: "Kabir Sen",
    segment: "Enterprise",
    decision: "escalate_human",
    priority: "review",
    recommendedAction: "Escalate funding and HQ fields for human review before changing the CRM record.",
    businessImpact:
      "Funding and headquarters conventions affect account notes and territory logic, but sources use different framing.",
    patchPreview: [{ field: "current_hq", from: "San Francisco, CA", to: "San Francisco, CA / Dublin, Ireland" }],
    fieldReviews: [
      {
        field: "funding",
        currentValue: "$6.5B",
        proposedValue: "Review required",
        trustScore: 45,
        rationale: "The funding value is plausible but public sources may mix total funding, latest round, and valuation language.",
        contradictions: ["Funding sources often report different totals depending on date and methodology."],
        evidence: [
          evidence("Stripe news", "https://stripe.com/newsroom", "news", "Stripe has announced major financing and valuation events over time."),
          evidence("Stripe company site", "https://stripe.com", "website", "Official site confirms company identity but not a simple funding total."),
        ],
      },
      {
        field: "hq",
        currentValue: "San Francisco, CA",
        proposedValue: "San Francisco, CA / Dublin, Ireland",
        trustScore: 58,
        rationale: "Public descriptions commonly reference dual-headquarters or major operating locations.",
        contradictions: ["Different sources emphasize US or Ireland headquarters."],
        evidence: [
          evidence("Stripe company site", "https://stripe.com", "website", "Stripe presents a global payments infrastructure company."),
        ],
      },
      {
        field: "industry",
        currentValue: "Payments",
        proposedValue: "Financial infrastructure",
        trustScore: 70,
        rationale: "Payments is correct but narrower than the company positioning.",
        contradictions: [],
        evidence: [
          evidence("Stripe homepage", "https://stripe.com", "website", "Stripe positions around financial infrastructure for businesses."),
        ],
      },
    ],
    sources: [
      evidence("Stripe homepage", "https://stripe.com", "website", "Company positioning."),
      evidence("Stripe newsroom", "https://stripe.com/newsroom", "news", "Financing context."),
    ],
  },
  notion: {
    id: "pr-notion",
    company: "Notion",
    website: "https://www.notion.so",
    owner: "Leah Kapoor",
    segment: "Mid-Market",
    decision: "accept_current",
    priority: "clear",
    recommendedAction: "Accept the current CRM values and keep the account in Mid-Market routing.",
    businessImpact: "No immediate routing or ownership change is needed.",
    patchPreview: [],
    fieldReviews: [
      {
        field: "headcount",
        currentValue: "600",
        proposedValue: "600",
        trustScore: 86,
        rationale: "The current employee count is directionally aligned with public workforce signals.",
        contradictions: [],
        evidence: [
          evidence("Notion LinkedIn", "https://www.linkedin.com/company/notionhq", "linkedin", "Workforce range is close enough for current segmentation."),
          evidence("Notion about", "https://www.notion.so/about", "website", "Company profile confirms identity and product category."),
        ],
      },
      {
        field: "hq",
        currentValue: "San Francisco, CA",
        proposedValue: "San Francisco, CA",
        trustScore: 93,
        rationale: "Public sources support the current headquarters value.",
        contradictions: [],
        evidence: [
          evidence("Notion about", "https://www.notion.so/about", "website", "Company profile supports the existing location."),
        ],
      },
      {
        field: "industry",
        currentValue: "Productivity software",
        proposedValue: "Productivity software",
        trustScore: 91,
        rationale: "The category is accurate for GTM routing.",
        contradictions: [],
        evidence: [
          evidence("Notion homepage", "https://www.notion.so", "website", "Notion positions as a workspace and productivity platform."),
        ],
      },
    ],
    sources: [
      evidence("Notion homepage", "https://www.notion.so", "website", "Product category."),
      evidence("Notion LinkedIn", "https://www.linkedin.com/company/notionhq", "linkedin", "Workforce signal."),
    ],
  },
};

const genericFallback = (record: CompanyRecord, index: number): DataPR => ({
  id: `pr-${record.id || index}`,
  company: record.company_name,
  website: record.website,
  owner: record.account_owner || "Unassigned",
  segment: record.segment || "Unsegmented",
  decision: "contact_company",
  priority: "review",
  recommendedAction: "Contact the company or account owner to confirm incomplete public evidence.",
  businessImpact: "The record has enough missing evidence to make automated enrichment unsafe.",
  patchPreview: [],
  fieldReviews: [
    {
      field: "website",
      currentValue: record.website || "Missing",
      proposedValue: record.website || "Needs verification",
      trustScore: record.website ? 68 : 25,
      rationale: "GroundTruth needs a stronger public source trail before changing this record.",
      contradictions: record.website ? [] : ["No website was supplied in the uploaded CSV."],
      evidence: record.website
        ? [evidence(`${record.company_name} website`, record.website, "website", "Provided website is available for follow-up verification.")]
        : [],
    },
  ],
  sources: record.website
    ? [evidence(`${record.company_name} website`, record.website, "website", "Provided website is available for follow-up verification.")]
    : [],
});

export function buildFallbackResponse(rows: CompanyRecord[]): EvaluateResponse {
  const prs = rows.map((row, index) => {
    const key = row.company_name.toLowerCase().trim();
    const fallback = fallbackByCompany[key] ?? genericFallback(row, index);

    return {
      ...fallback,
      id: `pr-${row.id || index}`,
      company: row.company_name,
      website: row.website || fallback.website,
      owner: row.account_owner || fallback.owner,
      segment: row.segment || fallback.segment,
    };
  });

  const allScores = prs.flatMap((pr) => pr.fieldReviews.map((field) => field.trustScore));
  const averageTrust = allScores.length
    ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length)
    : 0;

  return {
    runId: `fallback-${Date.now()}`,
    mode: "fallback",
    summary: {
      totalRecords: prs.length,
      proposedUpdates: prs.filter((pr) => pr.decision === "approve_update").length,
      escalations: prs.filter((pr) => pr.decision === "escalate_human" || pr.decision === "contact_company").length,
      accepted: prs.filter((pr) => pr.decision === "accept_current").length,
      averageTrust,
    },
    prs,
  };
}
