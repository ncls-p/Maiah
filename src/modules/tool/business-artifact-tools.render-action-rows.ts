import { z } from "zod";
import { createArtifact,escapeHtml,raciMatrixInputSchema,renderList } from "./business-artifact-tools.raci-matrix-input-schema";
import { actionItemSchema,actionPlanInputSchema,decisionMatrixInputSchema,emailPackInputSchema,impactSchema,meetingBriefInputSchema,projectStatusReportInputSchema,riskRegisterInputSchema,statusSchema } from "./business-artifact-tools.short-text";

export function renderActionRows(items: z.infer<typeof actionItemSchema>[]) {
  if (items.length === 0) return "";
  return `<div class="table-wrap"><table><thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>${items.map((item) => `<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.owner ?? "—")}</td><td>${escapeHtml(item.dueDate ?? "—")}</td><td>${escapeHtml(item.status ?? item.priority ?? "—")}</td></tr>`).join("")}</tbody></table></div>`;
}

export function createMeetingBriefArtifact(input: z.infer<typeof meetingBriefInputSchema>) {
  const body = `<header class="artifact-hero compact">
		<p class="artifact-kicker">Meeting brief${input.date ? ` · ${escapeHtml(input.date)}` : ""}</p>
		<h1>${escapeHtml(input.title)}</h1>
		${input.objective ? `<p class="artifact-summary">${escapeHtml(input.objective)}</p>` : ""}
	</header>
	<div class="artifact-grid two">
		<section class="artifact-card"><h2>Agenda</h2>${renderList(input.agenda)}</section>
		<section class="artifact-card"><h2>Decisions</h2>${renderList(input.decisions)}</section>
	</div>
	<section class="artifact-card"><h2>Action items</h2>${renderActionRows(input.actionItems)}</section>
	${input.attendees.length ? `<p class="artifact-meta">Attendees: ${escapeHtml(input.attendees.join(", "))}</p>` : ""}`;
  return createArtifact(input.title, body, input.height, "meeting_brief");
}

export function createActionPlanArtifact(input: z.infer<typeof actionPlanInputSchema>) {
  const phases = input.phases
    .map(
      (phase, index) => `<article class="timeline-item">
				<span>${index + 1}</span>
				<div><h2>${escapeHtml(phase.name)}</h2>${phase.timeframe ? `<p class="artifact-meta">${escapeHtml(phase.timeframe)}</p>` : ""}${phase.outcome ? `<p>${escapeHtml(phase.outcome)}</p>` : ""}${renderList(phase.tasks)}</div>
			</article>`,
    )
    .join("");
  const body = `<header class="artifact-hero compact"><p class="artifact-kicker">Action plan</p><h1>${escapeHtml(input.title)}</h1>${input.objective ? `<p class="artifact-summary">${escapeHtml(input.objective)}</p>` : ""}</header>
	<section class="timeline">${phases}</section>
	<section class="artifact-card"><h2>Owners and deadlines</h2>${renderActionRows(input.actionItems)}</section>
	${input.risks.length ? `<section class="artifact-card"><h2>Risks to watch</h2>${renderList(input.risks)}</section>` : ""}`;
  return createArtifact(input.title, body, input.height, "action_plan");
}

export function createDecisionMatrixArtifact(input: z.infer<typeof decisionMatrixInputSchema>) {
  const totalWeight = input.criteria.reduce((sum, item) => sum + item.weight, 0) || 1;
  const scoredOptions = input.options
    .map((option) => {
      const score = input.criteria.reduce((sum, criterion, index) => sum + (option.scores[index] ?? 0) * criterion.weight, 0);
      return { ...option, total: score / totalWeight };
    })
    .sort((a, b) => b.total - a.total);
  const header = `<th>Option</th>${input.criteria.map((criterion) => `<th>${escapeHtml(criterion.name)}<small>×${criterion.weight}</small></th>`).join("")}<th>Total</th>`;
  const rows = scoredOptions.map((option) => `<tr><td><strong>${escapeHtml(option.name)}</strong>${option.description ? `<small>${escapeHtml(option.description)}</small>` : ""}</td>${input.criteria.map((_, index) => `<td>${option.scores[index] ?? "—"}</td>`).join("")}<td><strong>${option.total.toFixed(1)}</strong></td></tr>`).join("");
  const body = `<header class="artifact-hero compact"><p class="artifact-kicker">Decision matrix</p><h1>${escapeHtml(input.title)}</h1>${input.context ? `<p class="artifact-summary">${escapeHtml(input.context)}</p>` : ""}</header>
	<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>
	<section class="artifact-card"><h2>Recommendation</h2><p>${escapeHtml(input.recommendation ?? scoredOptions[0]?.name ?? "Review the highest-scoring option.")}</p></section>`;
  return createArtifact(input.title, body, input.height, "decision_matrix");
}

export function createEmailPackArtifact(input: z.infer<typeof emailPackInputSchema>) {
  const emails = input.emails.map((email) => `<article class="artifact-section email-card"><p class="artifact-kicker">${escapeHtml(email.label)} · ${escapeHtml(input.tone)}</p><h2>${escapeHtml(email.subject)}</h2><pre>${escapeHtml(email.body)}</pre>${email.cta ? `<p class="artifact-meta">CTA: ${escapeHtml(email.cta)}</p>` : ""}</article>`).join("");
  const body = `<header class="artifact-hero compact"><p class="artifact-kicker">Email pack${input.audience ? ` · ${escapeHtml(input.audience)}` : ""}</p><h1>${escapeHtml(input.title)}</h1>${input.goal ? `<p class="artifact-summary">${escapeHtml(input.goal)}</p>` : ""}</header>${emails}`;
  return createArtifact(input.title, body, input.height, "email_pack");
}

function statusLabel(status: z.infer<typeof statusSchema>) {
  const labels = {
    green: "On track",
    yellow: "At risk",
    red: "Off track",
    blocked: "Blocked",
  };
  return labels[status];
}

function renderStatusBadge(status: z.infer<typeof statusSchema>) {
  return `<span class="status-badge status-${status}">${statusLabel(status)}</span>`;
}

function renderMetricCards(metrics: z.infer<typeof projectStatusReportInputSchema>["metrics"]) {
  if (metrics.length === 0) return "";
  return `<section class="artifact-grid metrics-grid">${metrics
    .map(
      (metric) => `<article class="metric-card">
				<p class="artifact-kicker">${escapeHtml(metric.label)}</p>
				<strong>${escapeHtml(metric.value)}</strong>
				${metric.target ? `<span>Target: ${escapeHtml(metric.target)}</span>` : ""}
				${metric.trend ? `<small>Trend: ${escapeHtml(metric.trend)}</small>` : ""}
			</article>`,
    )
    .join("")}</section>`;
}

export function createProjectStatusReportArtifact(input: z.infer<typeof projectStatusReportInputSchema>) {
  const milestones = input.milestones.map((milestone) => `<tr><td><strong>${escapeHtml(milestone.name)}</strong>${milestone.note ? `<small>${escapeHtml(milestone.note)}</small>` : ""}</td><td>${renderStatusBadge(milestone.status)}</td><td>${escapeHtml(milestone.dueDate ?? "—")}</td></tr>`).join("");
  const body = `<header class="artifact-hero compact">
		<p class="artifact-kicker">Project status${input.reportingPeriod ? ` · ${escapeHtml(input.reportingPeriod)}` : ""}</p>
		<div class="hero-row"><h1>${escapeHtml(input.title)}</h1>${renderStatusBadge(input.overallStatus)}</div>
		${input.executiveSummary ? `<p class="artifact-summary">${escapeHtml(input.executiveSummary)}</p>` : ""}
	</header>
	${renderMetricCards(input.metrics)}
	${input.milestones.length ? `<section class="artifact-card"><h2>Milestones</h2><div class="table-wrap"><table><thead><tr><th>Milestone</th><th>Status</th><th>Due</th></tr></thead><tbody>${milestones}</tbody></table></div></section>` : ""}
	<div class="artifact-grid two">
		<section class="artifact-card"><h2>Blockers</h2>${renderList(input.blockers)}</section>
		<section class="artifact-card"><h2>Decisions needed</h2>${renderList(input.decisionsNeeded)}</section>
	</div>
	<section class="artifact-card"><h2>Next actions</h2>${renderActionRows(input.nextSteps)}</section>`;
  return createArtifact(input.title, body, input.height, "project_status_report");
}

function riskScore(value: z.infer<typeof impactSchema>) {
  const scores = { low: 1, medium: 2, high: 3, critical: 4 };
  return scores[value];
}

export function createRiskRegisterArtifact(input: z.infer<typeof riskRegisterInputSchema>) {
  const rows = input.risks
    .map((risk) => {
      const score = riskScore(risk.likelihood) * riskScore(risk.impact);
      return `<tr><td><strong>${escapeHtml(risk.risk)}</strong>${risk.category ? `<small>${escapeHtml(risk.category)}</small>` : ""}</td><td>${escapeHtml(risk.likelihood)}</td><td>${escapeHtml(risk.impact)}</td><td><strong>${score}</strong></td><td>${escapeHtml(risk.owner ?? "—")}</td><td>${escapeHtml(risk.status)}</td><td>${escapeHtml(risk.mitigation ?? "—")}${risk.contingency ? `<small>Contingency: ${escapeHtml(risk.contingency)}</small>` : ""}</td></tr>`;
    })
    .join("");
  const body = `<header class="artifact-hero compact"><p class="artifact-kicker">Risk register</p><h1>${escapeHtml(input.title)}</h1>${input.context ? `<p class="artifact-summary">${escapeHtml(input.context)}</p>` : ""}</header>
	<div class="table-wrap"><table><thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Score</th><th>Owner</th><th>Status</th><th>Mitigation</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return createArtifact(input.title, body, input.height, "risk_register");
}

export function createRaciMatrixArtifact(input: z.infer<typeof raciMatrixInputSchema>) {
  const header = `<th>Activity</th>${input.roles.map((role) => `<th>${escapeHtml(role)}</th>`).join("")}<th>Notes</th>`;
  const rows = input.activities
    .map(
      (activity) =>
        `<tr><td><strong>${escapeHtml(activity.name)}</strong></td>${input.roles
          .map((_, index) => {
            const role = activity.assignments[index] ?? "-";
            return `<td><span class="raci raci-${role.toLowerCase()}">${role}</span></td>`;
          })
          .join("")}<td>${escapeHtml(activity.notes ?? "—")}</td></tr>`,
    )
    .join("");
  const body = `<header class="artifact-hero compact"><p class="artifact-kicker">RACI matrix</p><h1>${escapeHtml(input.title)}</h1>${input.context ? `<p class="artifact-summary">${escapeHtml(input.context)}</p>` : ""}</header>
	<div class="artifact-card"><p class="artifact-meta"><strong>R</strong> Responsible · <strong>A</strong> Accountable · <strong>C</strong> Consulted · <strong>I</strong> Informed</p></div>
	<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
  return createArtifact(input.title, body, input.height, "raci_matrix");
}
