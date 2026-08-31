import {
  raciMatrixInputSchema,
} from "@/modules/tool/business-artifact-tools.raci-matrix-input-schema";
import {
  actionPlanInputSchema,
  actionItemSchema,
  decisionMatrixInputSchema,
  emailPackInputSchema,
  meetingBriefInputSchema,
  projectStatusReportInputSchema,
  riskRegisterInputSchema,
} from "@/modules/tool/business-artifact-tools.short-text";
import {
  createActionPlanArtifact,
  createDecisionMatrixArtifact,
  createEmailPackArtifact,
  createMeetingBriefArtifact,
  createProjectStatusReportArtifact,
  createRaciMatrixArtifact,
  createRiskRegisterArtifact,
  renderActionRows,
} from "@/modules/tool/business-artifact-tools.render-action-rows";
import { describe, expect, it } from "vitest";

describe("business artifact branch coverage", () => {
  it("renders empty action rows as an empty string", () => {
    expect(renderActionRows([])).toBe("");
  });

  it("falls back to em-dash for missing action item fields and to priority when status is absent", () => {
    const [bare, prioritized] = [
      actionItemSchema.parse({ task: "Ship release" }),
      actionItemSchema.parse({ task: "Draft brief", priority: "high" }),
    ];
    const html = renderActionRows([bare, prioritized]);
    expect(html).toContain("Ship release</td><td>—</td><td>—</td><td>—</td>");
    expect(html).toContain("Draft brief</td><td>—</td><td>—</td><td>high</td>");
  });

  it("renders a meeting brief without date, objective, or attendees", () => {
    const input = meetingBriefInputSchema.parse({
      title: "Sync",
      agenda: ["Review Q3 numbers"],
      decisions: ["Ship v2"],
      actionItems: [actionItemSchema.parse({ task: "Follow up" })],
    });
    const artifact = createMeetingBriefArtifact(input);
    expect(artifact.html).toContain("Meeting brief</p>");
    expect(artifact.html).not.toContain("Attendees:");
    expect(artifact.html).not.toContain("artifact-summary");
  });

  it("renders a meeting brief with date, objective, and attendees", () => {
    const input = meetingBriefInputSchema.parse({
      title: "Sync",
      date: "2026-09-01",
      objective: "Align on roadmap",
      attendees: ["Ada", "Grace"],
    });
    const artifact = createMeetingBriefArtifact(input);
    expect(artifact.html).toContain("Meeting brief · 2026-09-01");
    expect(artifact.html).toContain("Align on roadmap");
    expect(artifact.html).toContain("Attendees: Ada, Grace");
  });

  it("renders an action plan with bare phases, no objective, and no risks", () => {
    const input = actionPlanInputSchema.parse({
      title: "Rollout",
      phases: [{ name: "Phase one" }],
    });
    const artifact = createActionPlanArtifact(input);
    expect(artifact.html).toContain("Phase one</h2>");
    expect(artifact.html).not.toContain("artifact-meta\">Week");
    expect(artifact.html).not.toContain("Risks to watch");
  });

  it("renders an action plan with timeframe, outcome, objective, and risks", () => {
    const input = actionPlanInputSchema.parse({
      title: "Rollout",
      objective: "Reach GA",
      phases: [
        {
          name: "Phase one",
          timeframe: "Week 1",
          outcome: "Stable pilot",
          tasks: ["Set up environments"],
        },
      ],
      risks: ["Flaky integration"],
    });
    const artifact = createActionPlanArtifact(input);
    expect(artifact.html).toContain("Week 1");
    expect(artifact.html).toContain("Stable pilot");
    expect(artifact.html).toContain("Reach GA");
    expect(artifact.html).toContain("Risks to watch");
  });

  it("normalizes zero total weight and renders a bare decision matrix", () => {
    const input = decisionMatrixInputSchema.parse({
      title: "Pick a stack",
      criteria: [
        { name: "Cost", weight: 0 },
        { name: "Speed", weight: 0 },
      ],
      options: [
        { name: "Option A", scores: [1] },
        { name: "Option B", scores: [1] },
      ],
    });
    const artifact = createDecisionMatrixArtifact(input);
    expect(artifact.html).toContain("Option A");
    expect(artifact.html).toContain("<h2>Recommendation</h2><p>Option A</p>");
    expect(artifact.html).toContain(">—<");
  });

  it("renders a decision matrix with context, description, and recommendation", () => {
    const input = decisionMatrixInputSchema.parse({
      title: "Pick a stack",
      context: "Budget constrained",
      criteria: [{ name: "Cost", weight: 2 }],
      options: [
        {
          name: "Option A",
          description: "Cheap and slow",
          scores: [5],
        },
        { name: "Option B", scores: [1] },
      ],
      recommendation: "Choose Option A",
    });
    const artifact = createDecisionMatrixArtifact(input);
    expect(artifact.html).toContain("Budget constrained");
    expect(artifact.html).toContain("Cheap and slow");
    expect(artifact.html).toContain("Choose Option A");
  });

  it("renders an email pack without audience, goal, or CTA", () => {
    const input = emailPackInputSchema.parse({
      title: "Launch emails",
      emails: [{ subject: "Hello", body: "We shipped." }],
    });
    const artifact = createEmailPackArtifact(input);
    expect(artifact.html).toContain("Hello");
    expect(artifact.html).not.toContain("CTA:");
    expect(artifact.html).not.toContain("Email pack ·");
  });

  it("renders an email pack with audience, goal, and CTA", () => {
    const input = emailPackInputSchema.parse({
      title: "Launch emails",
      goal: "Drive signups",
      audience: "Waitlist",
      emails: [
        {
          subject: "Hello",
          body: "We shipped.",
          cta: "Sign up now",
        },
      ],
    });
    const artifact = createEmailPackArtifact(input);
    expect(artifact.html).toContain("Email pack · Waitlist");
    expect(artifact.html).toContain("Drive signups");
    expect(artifact.html).toContain("CTA: Sign up now");
  });

  it("renders a project status report with empty metrics and milestones", () => {
    const input = projectStatusReportInputSchema.parse({
      title: "Weekly status",
    });
    const artifact = createProjectStatusReportArtifact(input);
    expect(artifact.html).not.toContain("metrics-grid");
    expect(artifact.html).not.toContain("Milestones");
    expect(artifact.html).not.toContain("artifact-summary");
  });

  it("renders a project status report with full metrics, milestones, and summary", () => {
    const input = projectStatusReportInputSchema.parse({
      title: "Weekly status",
      reportingPeriod: "Q3 W2",
      overallStatus: "yellow",
      executiveSummary: "On track overall",
      metrics: [
        {
          label: "Velocity",
          value: "42",
          target: "50",
          trend: "up",
        },
      ],
      milestones: [
        {
          name: "Beta",
          note: "Internal only",
          status: "green",
          dueDate: "2026-10-01",
        },
      ],
    });
    const artifact = createProjectStatusReportArtifact(input);
    expect(artifact.html).toContain("Project status · Q3 W2");
    expect(artifact.html).toContain("At risk");
    expect(artifact.html).toContain("On track overall");
    expect(artifact.html).toContain("Target: 50");
    expect(artifact.html).toContain("Trend: up");
    expect(artifact.html).toContain("Internal only");
  });

  it("renders a risk register with bare risks and no context", () => {
    const input = riskRegisterInputSchema.parse({
      title: "Risks",
      risks: [{ risk: "Vendor delay", status: "open" }],
    });
    const artifact = createRiskRegisterArtifact(input);
    expect(artifact.html).toContain("Vendor delay");
    expect(artifact.html).toContain(">4<");
    expect(artifact.html).not.toContain("Contingency:");
    expect(artifact.html).not.toContain("artifact-summary");
  });

  it("renders a risk register with category, owner, mitigation, and contingency", () => {
    const input = riskRegisterInputSchema.parse({
      title: "Risks",
      context: "Migration window",
      risks: [
        {
          risk: "Vendor delay",
          category: "Supply chain",
          likelihood: "high",
          impact: "critical",
          owner: "Ada",
          mitigation: "Pre-stage hardware",
          contingency: "Fall back to cloud",
          status: "open",
        },
      ],
    });
    const artifact = createRiskRegisterArtifact(input);
    expect(artifact.html).toContain("Supply chain");
    expect(artifact.html).toContain("Ada");
    expect(artifact.html).toContain("Pre-stage hardware");
    expect(artifact.html).toContain("Contingency: Fall back to cloud");
    expect(artifact.html).toContain("Migration window");
  });

  it("renders a RACI matrix with short assignments and no notes", () => {
    const input = raciMatrixInputSchema.parse({
      title: "RACI",
      roles: ["Alpha", "Beta"],
      activities: [{ name: "Plan", assignments: ["R"] }],
    });
    const artifact = createRaciMatrixArtifact(input);
    expect(artifact.html).toContain("raci-r");
    expect(artifact.html).toContain(">-</span>");
    expect(artifact.html).not.toContain("artifact-summary");
  });

  it("renders a RACI matrix with full assignments, notes, and context", () => {
    const input = raciMatrixInputSchema.parse({
      title: "RACI",
      context: "Release train",
      roles: ["Alpha", "Beta"],
      activities: [
        {
          name: "Plan",
          assignments: ["A", "C"],
          notes: "Weekly cadence",
        },
      ],
    });
    const artifact = createRaciMatrixArtifact(input);
    expect(artifact.html).toContain("raci-a");
    expect(artifact.html).toContain("raci-c");
    expect(artifact.html).toContain("Weekly cadence");
    expect(artifact.html).toContain("Release train");
  });
});