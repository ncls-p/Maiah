import { z } from "zod";
import { competitiveBattlecardInputSchema,createArtifact,customerAccountPlanInputSchema,escapeHtml,renderList } from "./business-artifact-tools.raci-matrix-input-schema";
import { renderActionRows } from "./business-artifact-tools.render-action-rows";

export function createCustomerAccountPlanArtifact(input: z.infer<typeof customerAccountPlanInputSchema>) {
  const stakeholders = input.stakeholders.map((person) => `<tr><td><strong>${escapeHtml(person.name)}</strong>${person.role ? `<small>${escapeHtml(person.role)}</small>` : ""}</td><td>${escapeHtml(person.influence)}</td><td>${escapeHtml(person.stance)}</td></tr>`).join("");
  const opportunities = input.opportunities.map((opportunity) => `<tr><td><strong>${escapeHtml(opportunity.name)}</strong>${opportunity.nextStep ? `<small>${escapeHtml(opportunity.nextStep)}</small>` : ""}</td><td>${escapeHtml(opportunity.value ?? "—")}</td><td>${escapeHtml(opportunity.stage ?? "—")}</td></tr>`).join("");
  const body = `<header class="artifact-hero compact"><p class="artifact-kicker">Account plan · ${escapeHtml(input.accountName)}</p><h1>${escapeHtml(input.title)}</h1>${input.objective ? `<p class="artifact-summary">${escapeHtml(input.objective)}</p>` : ""}</header>
	<div class="artifact-grid two">
		<section class="artifact-card"><h2>Stakeholder map</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Influence</th><th>Stance</th></tr></thead><tbody>${stakeholders}</tbody></table></div></section>
		<section class="artifact-card"><h2>Opportunities</h2><div class="table-wrap"><table><thead><tr><th>Opportunity</th><th>Value</th><th>Stage</th></tr></thead><tbody>${opportunities}</tbody></table></div></section>
	</div>
	${input.risks.length ? `<section class="artifact-card"><h2>Account risks</h2>${renderList(input.risks)}</section>` : ""}
	<section class="artifact-card"><h2>Mutual action plan</h2>${renderActionRows(input.nextActions)}</section>`;
  return createArtifact(input.title, body, input.height, "customer_account_plan");
}

export function createCompetitiveBattlecardArtifact(input: z.infer<typeof competitiveBattlecardInputSchema>) {
  const objections = input.objectionHandling.map((item) => `<article class="artifact-section"><h2>${escapeHtml(item.objection)}</h2><p>${escapeHtml(item.response)}</p></article>`).join("");
  const body = `<header class="artifact-hero compact"><p class="artifact-kicker">Competitive battlecard · ${escapeHtml(input.competitor)}</p><h1>${escapeHtml(input.title)}</h1>${input.positioning ? `<p class="artifact-summary">${escapeHtml(input.positioning)}</p>` : ""}</header>
	<div class="artifact-grid two">
		<section class="artifact-card"><h2>Win themes</h2>${renderList(input.winThemes)}</section>
		<section class="artifact-card"><h2>Landmines to set</h2>${renderList(input.landmines)}</section>
		<section class="artifact-card"><h2>Competitor strengths</h2>${renderList(input.strengths)}</section>
		<section class="artifact-card"><h2>Competitor weaknesses</h2>${renderList(input.weaknesses)}</section>
	</div>
	${objections ? `<section class="artifact-card"><h2>Objection handling</h2>${objections}</section>` : ""}
	${input.discoveryQuestions.length ? `<section class="artifact-card"><h2>Discovery questions</h2>${renderList(input.discoveryQuestions)}</section>` : ""}`;
  return createArtifact(input.title, body, input.height, "competitive_battlecard");
}

export function createBusinessArtifactCss() {
  return `:root { color-scheme: light; --accent: #25adc5; --ink: #111827; --muted: #667085; --line: #e5e7eb; --soft: #f8fafc; }
body { margin: 0; background: #f4f5f7; color: var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.artifact-toolbar { position: sticky; top: 0; z-index: 3; display: flex; justify-content: flex-end; gap: 8px; padding: 10px; background: rgba(244,245,247,.92); border-bottom: 1px solid var(--line); backdrop-filter: blur(8px); }
.artifact-toolbar button { border: 1px solid var(--line); border-radius: 999px; background: #fff; padding: 7px 12px; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.artifact-page { max-width: 980px; margin: 0 auto; padding: 42px; background: #fff; min-height: 100%; }
.artifact-hero { border-bottom: 1px solid var(--line); padding-bottom: 26px; margin-bottom: 26px; }
.artifact-hero.compact { padding-bottom: 20px; margin-bottom: 20px; }
.artifact-kicker { margin: 0 0 10px; color: var(--accent); font-size: 11px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(32px, 5vw, 56px); line-height: .96; letter-spacing: -.055em; }
h2 { margin: 0 0 10px; font-size: 18px; letter-spacing: -.02em; }
p { color: var(--muted); line-height: 1.58; }
.artifact-summary { max-width: 780px; font-size: 18px; color: #344054; }
.artifact-sections, .artifact-grid { display: grid; gap: 16px; }
.artifact-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.artifact-section, .artifact-card { border: 1px solid var(--line); border-radius: 18px; background: var(--soft); padding: 18px; margin-bottom: 16px; }
.artifact-list { margin: 0; padding-left: 18px; color: #344054; }
.artifact-list li { margin: 7px 0; line-height: 1.45; }
.insights { margin-top: 16px; }
.artifact-meta { color: var(--muted); font-size: 13px; }
.table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 16px; background: #fff; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { border-bottom: 1px solid var(--line); padding: 11px 12px; text-align: left; vertical-align: top; }
th { background: var(--soft); color: #475467; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
td small, th small { display: block; margin-top: 4px; color: var(--muted); font-weight: 500; text-transform: none; letter-spacing: 0; }
textarea { width: 100%; min-height: 140px; margin-top: 12px; border: 1px solid var(--line); border-radius: 12px; padding: 12px; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
.hero-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.status-badge { display: inline-flex; align-items: center; white-space: nowrap; border-radius: 999px; padding: 5px 9px; font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.status-green { background: #ecfdf3; color: #027a48; }
.status-yellow { background: #fffaeb; color: #b54708; }
.status-red { background: #fef3f2; color: #b42318; }
.status-blocked { background: #f2f4f7; color: #344054; }
.metrics-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 16px; }
.metric-card { border: 1px solid var(--line); border-radius: 18px; background: var(--soft); padding: 16px; }
.metric-card strong { display: block; font-size: 26px; letter-spacing: -.04em; }
.metric-card span, .metric-card small { display: block; color: var(--muted); margin-top: 4px; }
.raci { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 999px; font-weight: 800; font-size: 12px; }
.raci-r { background: #e0f2fe; color: #026aa2; }
.raci-a { background: #ecfdf3; color: #027a48; }
.raci-c { background: #fff7ed; color: #c2410c; }
.raci-i { background: #f4f3ff; color: #5925dc; }
.raci-- { background: #f2f4f7; color: #98a2b3; }
.timeline { display: grid; gap: 14px; }
.timeline-item { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 14px; }
.timeline-item > span { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, white); color: var(--accent); font-weight: 800; }
.email-card pre { white-space: pre-wrap; margin: 0; color: #344054; font: inherit; line-height: 1.6; }
@media (max-width: 720px) { .artifact-page { padding: 24px; } .artifact-grid.two, .metrics-grid { grid-template-columns: 1fr; } .hero-row { flex-direction: column; } }
@media print { @page { size: A4; margin: 14mm; } body { background: #fff; } .artifact-toolbar { display: none; } .artifact-page { padding: 0; max-width: none; } .artifact-section, .artifact-card, .table-wrap { break-inside: avoid; } }`;
}

export function createBusinessArtifactJs() {
  return `document.addEventListener('click', (event) => { const button = event.target.closest('[data-print]'); if (button) window.print(); });`;
}
