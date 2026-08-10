import { z } from "zod";
import {
  createBusinessArtifactCss,
  createBusinessArtifactJs,
} from "./business-artifact-tools.create-customer-account-plan-artifact";
import {
  actionItemSchema,
  artifactHeight,
  businessDocumentInputSchema,
  optionalText,
  raciRoleSchema,
  shortText,
  spreadsheetInputSchema,
} from "./business-artifact-tools.short-text";

export const raciMatrixInputSchema = z.object({
  title: shortText,
  context: optionalText,
  roles: z.array(z.string().trim().min(1).max(80)).min(2).max(12),
  activities: z
    .array(
      z.object({
        name: shortText,
        assignments: z.array(raciRoleSchema).max(12).default([]),
        notes: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(30),
  height: artifactHeight,
});

export const customerAccountPlanInputSchema = z.object({
  title: shortText,
  accountName: shortText,
  objective: optionalText,
  stakeholders: z
    .array(
      z.object({
        name: shortText,
        role: z.string().trim().max(120).optional(),
        influence: z.enum(["low", "medium", "high"]).default("medium"),
        stance: z
          .enum(["supporter", "neutral", "skeptic", "unknown"])
          .default("unknown"),
      }),
    )
    .max(20)
    .default([]),
  opportunities: z
    .array(
      z.object({
        name: shortText,
        value: z.string().trim().max(120).optional(),
        stage: z.string().trim().max(100).optional(),
        nextStep: z.string().trim().max(260).optional(),
      }),
    )
    .max(12)
    .default([]),
  risks: z.array(z.string().trim().min(1).max(260)).max(10).default([]),
  nextActions: z.array(actionItemSchema).max(16).default([]),
  height: artifactHeight,
});

export const competitiveBattlecardInputSchema = z.object({
  title: shortText,
  competitor: shortText,
  positioning: optionalText,
  winThemes: z.array(z.string().trim().min(1).max(260)).max(8).default([]),
  strengths: z.array(z.string().trim().min(1).max(260)).max(8).default([]),
  weaknesses: z.array(z.string().trim().min(1).max(260)).max(8).default([]),
  landmines: z.array(z.string().trim().min(1).max(260)).max(8).default([]),
  objectionHandling: z
    .array(
      z.object({
        objection: shortText,
        response: z.string().trim().min(1).max(700),
      }),
    )
    .max(10)
    .default([]),
  discoveryQuestions: z
    .array(z.string().trim().min(1).max(260))
    .max(10)
    .default([]),
  height: artifactHeight,
});

export function escapeHtml(value: string | undefined) {
  return (value ?? "").replace(/[&<>'"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "'") return "&#39;";
    return "&quot;";
  });
}

export function renderList(items: string[], className = "artifact-list") {
  if (items.length === 0) return "";
  return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderPrintToolbar(label = "Print / PDF") {
  return `<div class="artifact-toolbar"><button type="button" data-print>${label}</button></div>`;
}

export function createArtifact(
  title: string,
  body: string,
  height: number,
  artifactType: string,
) {
  return {
    kind: "html_artifact" as const,
    title,
    html: `${renderPrintToolbar()}<main class="artifact-page" data-artifact-type="${artifactType}">${body}</main>`,
    css: createBusinessArtifactCss(),
    js: createBusinessArtifactJs(),
    height,
    artifactType,
  };
}

function documentTypeLabel(
  type: z.infer<typeof businessDocumentInputSchema>["documentType"],
) {
  const labels = {
    brief: "Brief",
    memo: "Memo",
    report: "Report",
    proposal: "Proposal",
    policy: "Policy",
    sop: "SOP",
  };
  return labels[type];
}

export function createBusinessDocumentArtifact(
  input: z.infer<typeof businessDocumentInputSchema>,
) {
  const body = `<header class="artifact-hero">
		<p class="artifact-kicker">${documentTypeLabel(input.documentType)}${input.audience ? ` · ${escapeHtml(input.audience)}` : ""}</p>
		<h1>${escapeHtml(input.title)}</h1>
		${input.executiveSummary ? `<p class="artifact-summary">${escapeHtml(input.executiveSummary)}</p>` : ""}
	</header>
	<section class="artifact-sections">
		${input.sections
      .map(
        (section) => `<article class="artifact-section">
					<h2>${escapeHtml(section.heading)}</h2>
					${section.content ? `<p>${escapeHtml(section.content)}</p>` : ""}
					${renderList(section.bullets)}
				</article>`,
      )
      .join("")}
	</section>
	${input.nextSteps.length ? `<section class="artifact-card"><h2>Next steps</h2>${renderList(input.nextSteps)}</section>` : ""}`;
  return createArtifact(input.title, body, input.height, "business_document");
}

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(columns: string[], rows: string[][]) {
  return [columns, ...rows]
    .map((row) =>
      columns.map((_, index) => csvEscape(row[index] ?? "")).join(","),
    )
    .join("\n");
}

export function createSpreadsheetArtifact(
  input: z.infer<typeof spreadsheetInputSchema>,
) {
  const normalizedRows = input.rows.map((row) =>
    input.columns.map((_, index) => row[index] ?? ""),
  );
  const tableRows = normalizedRows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`,
    )
    .join("");
  const body = `<header class="artifact-hero compact">
		<p class="artifact-kicker">Spreadsheet</p>
		<h1>${escapeHtml(input.title)}</h1>
		${input.summary ? `<p class="artifact-summary">${escapeHtml(input.summary)}</p>` : ""}
	</header>
	<div class="table-wrap"><table><thead><tr>${input.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></div>
	${renderList(input.insights, "artifact-list insights")}
	<details class="artifact-card"><summary>CSV export</summary><textarea readonly>${escapeHtml(toCsv(input.columns, normalizedRows))}</textarea></details>`;
  return createArtifact(input.title, body, input.height, "spreadsheet");
}
