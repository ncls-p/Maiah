import { describe, expect, it } from "vitest";
import {
	actionPlanInputSchema,
	businessDocumentInputSchema,
	competitiveBattlecardInputSchema,
	createActionPlanArtifact,
	createBusinessDocumentArtifact,
	createCompetitiveBattlecardArtifact,
	createCustomerAccountPlanArtifact,
	createDecisionMatrixArtifact,
	createEmailPackArtifact,
	createMeetingBriefArtifact,
	createProjectStatusReportArtifact,
	createRaciMatrixArtifact,
	createRiskRegisterArtifact,
	createSpreadsheetArtifact,
	customerAccountPlanInputSchema,
	decisionMatrixInputSchema,
	emailPackInputSchema,
	meetingBriefInputSchema,
	projectStatusReportInputSchema,
	raciMatrixInputSchema,
	riskRegisterInputSchema,
	spreadsheetInputSchema,
} from "@/modules/tool/business-artifact-tools";

function expectArtifact(
	artifact: ReturnType<typeof createBusinessDocumentArtifact>,
	type: string,
) {
	expect(artifact.kind).toBe("html_artifact");
	expect(artifact.artifactType).toBe(type);
	expect(artifact.html).toContain(`data-artifact-type="${type}"`);
	expect(artifact.html).toContain("data-print");
	expect(artifact.css).toContain(".artifact-page");
	expect(artifact.js).toContain("window.print");
}

describe("business artifact tools", () => {
	it("renders document, spreadsheet, meeting, action plan, decision matrix, and email artifacts", () => {
		expectArtifact(
			createBusinessDocumentArtifact(
				businessDocumentInputSchema.parse({
					title: "Business <Brief>",
					documentType: "proposal",
					audience: "Execs",
					executiveSummary: "Summary",
					sections: [
						{
							heading: "Scope",
							content: "Build & launch",
							bullets: ["One", "Two"],
						},
					],
					nextSteps: ["Approve"],
				}),
			),
			"business_document",
		);

		const spreadsheet = createSpreadsheetArtifact(
			spreadsheetInputSchema.parse({
				title: "Revenue",
				summary: "Quarterly",
				columns: ["Name", "Value"],
				rows: [
					["ACME", "1,000"],
					["Quoted", 'He said "yes"'],
				],
				insights: ["Growing"],
			}),
		);
		expectArtifact(spreadsheet, "spreadsheet");
		expect(spreadsheet.html).toContain(
			"&quot;He said &quot;&quot;yes&quot;&quot;&quot;",
		);

		expectArtifact(
			createMeetingBriefArtifact(
				meetingBriefInputSchema.parse({
					title: "Weekly sync",
					date: "Monday",
					attendees: ["Ada", "Grace"],
					objective: "Align",
					agenda: ["Roadmap"],
					decisions: ["Ship"],
					actionItems: [
						{
							task: "Follow up",
							owner: "Ada",
							dueDate: "Friday",
							priority: "high",
						},
					],
				}),
			),
			"meeting_brief",
		);

		expectArtifact(
			createActionPlanArtifact(
				actionPlanInputSchema.parse({
					title: "Launch plan",
					objective: "Launch safely",
					phases: [
						{
							name: "Prepare",
							timeframe: "Q1",
							outcome: "Ready",
							tasks: ["Plan"],
						},
					],
					actionItems: [{ task: "Owner task", status: "open" }],
					risks: ["Delay"],
				}),
			),
			"action_plan",
		);

		const matrix = createDecisionMatrixArtifact(
			decisionMatrixInputSchema.parse({
				title: "Choose vendor",
				context: "Procurement",
				criteria: [
					{ name: "Price", weight: 2 },
					{ name: "Quality", weight: 3 },
				],
				options: [
					{ name: "A", description: "Cheap", scores: [5, 2] },
					{ name: "B", description: "Best", scores: [3, 5] },
				],
			}),
		);
		expectArtifact(matrix, "decision_matrix");
		expect(matrix.html).toContain("B");

		expectArtifact(
			createEmailPackArtifact(
				emailPackInputSchema.parse({
					title: "Outreach",
					goal: "Book meetings",
					audience: "Prospects",
					tone: "sales",
					emails: [
						{
							label: "Email 1",
							subject: "Hello",
							body: "Hi there",
							cta: "Reply",
						},
					],
				}),
			),
			"email_pack",
		);
	});

	it("renders status, risk, RACI, account plan, and battlecard artifacts", () => {
		expectArtifact(
			createProjectStatusReportArtifact(
				projectStatusReportInputSchema.parse({
					title: "Project report",
					reportingPeriod: "January",
					overallStatus: "yellow",
					executiveSummary: "At risk",
					metrics: [
						{ label: "Velocity", value: "12", target: "10", trend: "up" },
					],
					milestones: [
						{ name: "Beta", status: "green", dueDate: "Feb", note: "Ready" },
					],
					blockers: ["Dependency"],
					decisionsNeeded: ["Budget"],
					nextSteps: [{ task: "Resolve dependency", owner: "PM" }],
				}),
			),
			"project_status_report",
		);

		const risk = createRiskRegisterArtifact(
			riskRegisterInputSchema.parse({
				title: "Risks",
				context: "Program",
				risks: [
					{
						risk: "Outage",
						category: "Tech",
						likelihood: "high",
						impact: "critical",
						owner: "Ops",
						mitigation: "Redundancy",
						contingency: "Rollback",
					},
				],
			}),
		);
		expectArtifact(risk, "risk_register");
		expect(risk.html).toContain("12");

		expectArtifact(
			createRaciMatrixArtifact(
				raciMatrixInputSchema.parse({
					title: "RACI",
					context: "Delivery",
					roles: ["PM", "Eng"],
					activities: [
						{ name: "Build", assignments: ["A", "R"], notes: "Core" },
					],
				}),
			),
			"raci_matrix",
		);

		expectArtifact(
			createCustomerAccountPlanArtifact(
				customerAccountPlanInputSchema.parse({
					title: "Account plan",
					accountName: "ACME",
					objective: "Expand",
					stakeholders: [
						{
							name: "Jane",
							role: "CFO",
							influence: "high",
							stance: "supporter",
						},
					],
					opportunities: [
						{
							name: "Expansion",
							value: "$1M",
							stage: "Discovery",
							nextStep: "Workshop",
						},
					],
					risks: ["Competitor"],
					nextActions: [{ task: "Schedule workshop", dueDate: "Next week" }],
				}),
			),
			"customer_account_plan",
		);

		expectArtifact(
			createCompetitiveBattlecardArtifact(
				competitiveBattlecardInputSchema.parse({
					title: "Battlecard",
					competitor: "RivalCo",
					positioning: "We win on support",
					winThemes: ["Service"],
					landmines: ["Ask about uptime"],
					strengths: ["Brand"],
					weaknesses: ["Slow"],
					objectionHandling: [
						{ objection: "Too expensive", response: "Lower TCO" },
					],
					discoveryQuestions: ["What matters most?"],
				}),
			),
			"competitive_battlecard",
		);
	});
});
