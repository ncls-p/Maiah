import { z } from "zod";

export const shortText = z.string().trim().min(1).max(220);
export const optionalText = z.string().trim().max(1_500).optional();
export const artifactHeight = z.number().int().min(360).max(900).default(620);

export const actionItemSchema = z.object({
  task: shortText,
  owner: z.string().trim().max(120).optional(),
  dueDate: z.string().trim().max(80).optional(),
  status: z.string().trim().max(80).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export const businessDocumentInputSchema = z.object({
  title: shortText,
  documentType: z.enum(["brief", "memo", "report", "proposal", "policy", "sop"]).default("brief"),
  audience: z.string().trim().max(160).optional(),
  executiveSummary: optionalText,
  sections: z
    .array(
      z.object({
        heading: shortText,
        content: optionalText,
        bullets: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
      }),
    )
    .min(1)
    .max(12),
  nextSteps: z.array(z.string().trim().min(1).max(280)).max(8).default([]),
  height: artifactHeight,
});

export const spreadsheetInputSchema = z.object({
  title: shortText,
  summary: optionalText,
  columns: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  rows: z.array(z.array(z.string().max(500)).max(12)).max(100),
  insights: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
  height: artifactHeight,
});

export const meetingBriefInputSchema = z.object({
  title: shortText,
  date: z.string().trim().max(80).optional(),
  attendees: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  objective: optionalText,
  agenda: z.array(z.string().trim().min(1).max(240)).max(12).default([]),
  decisions: z.array(z.string().trim().min(1).max(280)).max(12).default([]),
  actionItems: z.array(actionItemSchema).max(20).default([]),
  height: artifactHeight,
});

export const actionPlanInputSchema = z.object({
  title: shortText,
  objective: optionalText,
  phases: z
    .array(
      z.object({
        name: shortText,
        timeframe: z.string().trim().max(120).optional(),
        outcome: optionalText,
        tasks: z.array(z.string().trim().min(1).max(240)).max(8).default([]),
      }),
    )
    .min(1)
    .max(8),
  actionItems: z.array(actionItemSchema).max(30).default([]),
  risks: z.array(z.string().trim().min(1).max(260)).max(10).default([]),
  height: artifactHeight,
});

export const decisionMatrixInputSchema = z.object({
  title: shortText,
  context: optionalText,
  criteria: z
    .array(
      z.object({
        name: shortText,
        weight: z.number().min(0).max(10).default(1),
      }),
    )
    .min(1)
    .max(8),
  options: z
    .array(
      z.object({
        name: shortText,
        description: z.string().trim().max(320).optional(),
        scores: z.array(z.number().min(0).max(5)).max(8).default([]),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(2)
    .max(8),
  recommendation: optionalText,
  height: artifactHeight,
});

export const emailPackInputSchema = z.object({
  title: shortText,
  goal: optionalText,
  audience: z.string().trim().max(180).optional(),
  tone: z.enum(["direct", "friendly", "executive", "sales", "support"]).default("friendly"),
  emails: z
    .array(
      z.object({
        label: z.string().trim().max(100).default("Email"),
        subject: shortText,
        body: z.string().trim().min(1).max(4_000),
        cta: z.string().trim().max(220).optional(),
      }),
    )
    .min(1)
    .max(6),
  height: artifactHeight,
});

export const statusSchema = z.enum(["green", "yellow", "red", "blocked"]);
export const impactSchema = z.enum(["low", "medium", "high", "critical"]);
export const raciRoleSchema = z.enum(["R", "A", "C", "I", "-"]);

export const projectStatusReportInputSchema = z.object({
  title: shortText,
  reportingPeriod: z.string().trim().max(120).optional(),
  overallStatus: statusSchema.default("green"),
  executiveSummary: optionalText,
  metrics: z
    .array(
      z.object({
        label: shortText,
        value: z.string().trim().min(1).max(120),
        target: z.string().trim().max(120).optional(),
        trend: z.enum(["up", "down", "flat"]).optional(),
      }),
    )
    .max(8)
    .default([]),
  milestones: z
    .array(
      z.object({
        name: shortText,
        status: statusSchema.default("green"),
        dueDate: z.string().trim().max(80).optional(),
        note: z.string().trim().max(400).optional(),
      }),
    )
    .max(12)
    .default([]),
  blockers: z.array(z.string().trim().min(1).max(280)).max(10).default([]),
  decisionsNeeded: z.array(z.string().trim().min(1).max(280)).max(10).default([]),
  nextSteps: z.array(actionItemSchema).max(16).default([]),
  height: artifactHeight,
});

export const riskRegisterInputSchema = z.object({
  title: shortText,
  context: optionalText,
  risks: z
    .array(
      z.object({
        risk: shortText,
        category: z.string().trim().max(100).optional(),
        likelihood: impactSchema.default("medium"),
        impact: impactSchema.default("medium"),
        owner: z.string().trim().max(120).optional(),
        mitigation: z.string().trim().max(500).optional(),
        contingency: z.string().trim().max(500).optional(),
        status: z.enum(["open", "monitoring", "mitigating", "closed"]).default("open"),
      }),
    )
    .min(1)
    .max(30),
  height: artifactHeight,
});
