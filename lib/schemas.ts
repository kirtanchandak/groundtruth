import { z } from "zod";

export const CompanyRecordSchema = z.object({
  id: z.string(),
  company_name: z.string().min(1),
  website: z.string().optional().default(""),
  linkedin_url: z.string().optional().default(""),
  current_headcount: z.string().optional().default(""),
  current_hq: z.string().optional().default(""),
  current_funding: z.string().optional().default(""),
  current_industry: z.string().optional().default(""),
  account_owner: z.string().optional().default(""),
  segment: z.string().optional().default(""),
});

export const EvidenceSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  sourceType: z.enum(["website", "linkedin", "news", "database", "filing", "other"]),
  claim: z.string(),
});

export const FieldEvalSchema = z.object({
  field: z.enum([
    "headcount",
    "hq",
    "funding",
    "industry",
    "website",
    "linkedin_profile",
    "segment_routing",
  ]),
  currentValue: z.string(),
  proposedValue: z.string(),
  trustScore: z.number().min(0).max(100),
  rationale: z.string(),
  contradictions: z.array(z.string()),
  evidence: z.array(EvidenceSourceSchema),
});

export const DataPRSchema = z.object({
  id: z.string(),
  company: z.string(),
  website: z.string(),
  owner: z.string(),
  segment: z.string(),
  decision: z.enum(["accept_current", "approve_update", "escalate_human", "contact_company"]),
  priority: z.enum(["critical", "review", "clear"]),
  recommendedAction: z.string(),
  businessImpact: z.string(),
  patchPreview: z.array(
    z.object({
      field: z.string(),
      from: z.string(),
      to: z.string(),
    }),
  ),
  fieldReviews: z.array(FieldEvalSchema),
  sources: z.array(EvidenceSourceSchema),
});

export const EvaluateRequestSchema = z.object({
  rows: z.array(CompanyRecordSchema).min(1).max(12),
  forceDemo: z.boolean().optional().default(false),
});

export const EvaluateResponseSchema = z.object({
  runId: z.string(),
  mode: z.enum(["live", "fallback"]),
  summary: z.object({
    totalRecords: z.number(),
    proposedUpdates: z.number(),
    escalations: z.number(),
    accepted: z.number(),
    averageTrust: z.number(),
  }),
  prs: z.array(DataPRSchema),
});

export const AgentRoleSchema = z.enum([
  "ingestion",
  "source_hunter",
  "identity_resolver",
  "contradiction_analyst",
  "trust_scorer",
  "data_pr_writer",
]);

export const AgentEventTypeSchema = z.enum([
  "run_started",
  "company_started",
  "agent_started",
  "agent_log",
  "field_update",
  "evidence_found",
  "data_pr_created",
  "company_completed",
  "run_completed",
  "run_failed",
]);

export const AgentEventSchema = z.object({
  id: z.string(),
  type: AgentEventTypeSchema,
  runId: z.string(),
  companyId: z.string().optional(),
  company: z.string().optional(),
  fieldKey: z.string().optional(),
  agent: AgentRoleSchema.optional(),
  message: z.string().optional(),
  mode: z.enum(["live", "fallback"]).optional(),
  progress: z.number().min(0).max(100).optional(),
  field: FieldEvalSchema.optional(),
  evidence: EvidenceSourceSchema.optional(),
  pr: DataPRSchema.optional(),
  summary: EvaluateResponseSchema.shape.summary.optional(),
  timestamp: z.string(),
});

export const CellStatusSchema = z.enum(["queued", "running", "verified", "changed", "conflict", "failed"]);

export const GridFieldKeySchema = z.enum([
  "website",
  "linkedin_profile",
  "headcount",
  "hq",
  "funding",
  "industry",
  "segment_routing",
]);

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  filename: z.string(),
  rowCount: z.number(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export const GridCellEvalSchema = z.object({
  id: z.string(),
  rowId: z.string(),
  fieldKey: GridFieldKeySchema,
  currentValue: z.string(),
  proposedValue: z.string(),
  trustScore: z.number().min(0).max(100).optional(),
  status: CellStatusSchema,
  rationale: z.string().optional(),
  contradictions: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSourceSchema).default([]),
});

export const ProjectRowSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sourceIndex: z.number(),
  record: CompanyRecordSchema,
  status: z.enum(["queued", "running", "completed", "failed"]),
  progress: z.number().min(0).max(100),
  selectedDecision: z.string().optional(),
  cells: z.array(GridCellEvalSchema).default([]),
  dataPr: DataPRSchema.optional(),
  events: z.array(AgentEventSchema).default([]),
});

export const ProjectSnapshotSchema = z.object({
  mode: z.enum(["supabase", "local"]),
  project: ProjectSchema,
  rows: z.array(ProjectRowSchema),
});

export const ProjectsListResponseSchema = z.object({
  mode: z.enum(["supabase", "local"]),
  projects: z.array(ProjectSchema),
});

export const CreateProjectRequestSchema = z.object({
  name: z.string().optional(),
  filename: z.string().optional(),
  rows: z.array(CompanyRecordSchema).min(1).max(100),
});

export const CompanyEvalStateSchema = z.object({
  record: CompanyRecordSchema,
  status: z.enum(["queued", "running", "completed", "failed"]),
  currentAgent: AgentRoleSchema.optional(),
  progress: z.number().min(0).max(100),
  pr: DataPRSchema.optional(),
  events: z.array(AgentEventSchema),
});

export const EvalRunStateSchema = z.object({
  runId: z.string(),
  mode: z.enum(["live", "fallback", "idle"]),
  status: z.enum(["idle", "running", "completed", "failed"]),
  companies: z.array(CompanyEvalStateSchema),
  events: z.array(AgentEventSchema),
  summary: EvaluateResponseSchema.shape.summary.optional(),
});

export type CompanyRecord = z.infer<typeof CompanyRecordSchema>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type FieldEval = z.infer<typeof FieldEvalSchema>;
export type DataPR = z.infer<typeof DataPRSchema>;
export type EvaluateResponse = z.infer<typeof EvaluateResponseSchema>;
export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type CellStatus = z.infer<typeof CellStatusSchema>;
export type GridFieldKey = z.infer<typeof GridFieldKeySchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type GridCellEval = z.infer<typeof GridCellEvalSchema>;
export type ProjectRow = z.infer<typeof ProjectRowSchema>;
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;
export type ProjectsListResponse = z.infer<typeof ProjectsListResponseSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type CompanyEvalState = z.infer<typeof CompanyEvalStateSchema>;
export type EvalRunState = z.infer<typeof EvalRunStateSchema>;

export const agentProfiles: Array<{
  role: AgentRole;
  name: string;
  shortName: string;
  description: string;
}> = [
  {
    role: "ingestion",
    name: "Ingestion Agent",
    shortName: "Ingestion",
    description: "Maps CSV columns and validates account records.",
  },
  {
    role: "source_hunter",
    name: "Source Hunter",
    shortName: "Hunter",
    description: "Searches public evidence across company pages, profiles, filings, and news.",
  },
  {
    role: "identity_resolver",
    name: "Identity Resolver",
    shortName: "Resolver",
    description: "Confirms the website, company profile, and account identity match.",
  },
  {
    role: "contradiction_analyst",
    name: "Contradiction Analyst",
    shortName: "Analyst",
    description: "Finds conflicts between CRM values and public evidence.",
  },
  {
    role: "trust_scorer",
    name: "Trust Scorer",
    shortName: "Scorer",
    description: "Assigns field-level confidence and risk.",
  },
  {
    role: "data_pr_writer",
    name: "Data PR Writer",
    shortName: "Writer",
    description: "Drafts the final decision, business impact, and patch.",
  },
];

export const agentNameByRole = Object.fromEntries(
  agentProfiles.map((agent) => [agent.role, agent.name]),
) as Record<AgentRole, string>;

export const evaluateResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "prs"],
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["totalRecords", "proposedUpdates", "escalations", "accepted", "averageTrust"],
      properties: {
        totalRecords: { type: "number" },
        proposedUpdates: { type: "number" },
        escalations: { type: "number" },
        accepted: { type: "number" },
        averageTrust: { type: "number" },
      },
    },
    prs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "company",
          "website",
          "owner",
          "segment",
          "decision",
          "priority",
          "recommendedAction",
          "businessImpact",
          "patchPreview",
          "fieldReviews",
          "sources",
        ],
        properties: {
          id: { type: "string" },
          company: { type: "string" },
          website: { type: "string" },
          owner: { type: "string" },
          segment: { type: "string" },
          decision: {
            type: "string",
            enum: ["accept_current", "approve_update", "escalate_human", "contact_company"],
          },
          priority: { type: "string", enum: ["critical", "review", "clear"] },
          recommendedAction: { type: "string" },
          businessImpact: { type: "string" },
          patchPreview: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["field", "from", "to"],
              properties: {
                field: { type: "string" },
                from: { type: "string" },
                to: { type: "string" },
              },
            },
          },
          fieldReviews: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "field",
                "currentValue",
                "proposedValue",
                "trustScore",
                "rationale",
                "contradictions",
                "evidence",
              ],
              properties: {
                field: {
                  type: "string",
                  enum: [
                    "headcount",
                    "hq",
                    "funding",
                    "industry",
                    "website",
                    "linkedin_profile",
                    "segment_routing",
                  ],
                },
                currentValue: { type: "string" },
                proposedValue: { type: "string" },
                trustScore: { type: "number" },
                rationale: { type: "string" },
                contradictions: { type: "array", items: { type: "string" } },
                evidence: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "url", "sourceType", "claim"],
                    properties: {
                      title: { type: "string" },
                      url: { type: "string" },
                      sourceType: {
                        type: "string",
                        enum: ["website", "linkedin", "news", "database", "filing", "other"],
                      },
                      claim: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "url", "sourceType", "claim"],
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                sourceType: {
                  type: "string",
                  enum: ["website", "linkedin", "news", "database", "filing", "other"],
                },
                claim: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;
