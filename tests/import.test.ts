import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { POST as createProjectRoute } from "@/app/api/projects/route";
import { GET as getTemplate } from "@/app/api/import/template/route";
import { POST as validateImportRoute } from "@/app/api/projects/[id]/import/validate/route";
import { POST as confirmImportRoute } from "@/app/api/projects/[id]/import/confirm/route";
import { IMPORT_COLUMNS } from "@/lib/import/parse";
import { UNASSIGNED_NAME } from "@/lib/requirements";
import { getProjectHierarchyRows } from "@/lib/export";
import { createUser, jsonRequest, sessionFor, uniqueCode, uniqueEmail } from "./support/fixtures";

const mockAuth = vi.mocked(auth);

function csvRequest(url: string, csvContent: string, fileName = "import.csv") {
  const formData = new FormData();
  formData.append("file", new File([csvContent], fileName, { type: "text/csv" }));
  return new NextRequest(url, { method: "POST", body: formData });
}

/* Names itself, and hands the name back on the project it returns. Every row
 * an import test builds has to name the project it targets, so the code is a
 * join key here, not decoration — the call sites read it off `project.code`
 * instead of repeating a literal that has to match. */
async function createProject() {
  const code = uniqueCode("prj-imp");
  return (
    await createProjectRoute(
      jsonRequest("http://test/api/projects", "POST", {
        code,
        name: `Project ${code}`,
        status: "DRAFT",
      }),
    )
  ).json();
}

const CSV_HEADER = IMPORT_COLUMNS.join(",");

/** Builds a CSV data row from column name → value, defaulting every column
 * not given to "". Positional (a plain array + .join(",")) is exactly what
 * broke twice already as IMPORT_COLUMNS grew — a row written against one
 * column count silently misaligns, or throws an "Invalid Record Length",
 * against a later one. Keying by name survives future columns unchanged. */
function csvRow(values: Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>): string {
  return IMPORT_COLUMNS.map((column) => values[column] ?? "").join(",");
}

describe("import", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("template download returns the expected columns", async () => {
    const user = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(user.id) as never);

    const response = await getTemplate();
    expect(response.status).toBe(200);
    const text = await response.text();
    const headerLine = text.split("\n")[0];
    for (const column of IMPORT_COLUMNS) {
      expect(headerLine).toContain(column);
    }
  });

  it("rejects an oversized or wrong-type file before parsing", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();
    const params = Promise.resolve({ id: project.id });

    const wrongType = await validateImportRoute(
      csvRequest(`http://test/api/projects/${project.id}/import/validate`, "irrelevant", "notes.txt"),
      { params },
    );
    expect(wrongType.status).toBe(400);

    const oversizedContent = "a".repeat(11 * 1024 * 1024);
    const oversized = await validateImportRoute(
      csvRequest(`http://test/api/projects/${project.id}/import/validate`, oversizedContent, "big.csv"),
      { params },
    );
    expect(oversized.status).toBe(400);
  });

  it("reports invalid rows with row/field/reason without blocking valid rows, and writes nothing", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const csv = [
      CSV_HEADER,
      csvRow({
        "Project Code": project.code,
        "Scenario Name": "Login Flow",
        "Test Group Name": "Functional",
        "Test Case Name": "Valid login",
        "Test Steps": "Enter credentials",
        "Expected Result": "User reaches dashboard",
        Priority: "HIGH",
      }),
      csvRow({
        "Project Code": project.code,
        "Test Group Name": "Functional",
        "Test Case Name": "Missing scenario name",
        "Test Steps": "Some step",
        "Expected Result": "Some result",
        Priority: "LOW",
      }),
    ].join("\n");

    const response = await validateImportRoute(
      csvRequest(`http://test/api/projects/${project.id}/import/validate`, csv),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(response.status).toBe(200);
    const preview = await response.json();

    expect(preview.summary.total).toBe(2);
    expect(preview.summary.valid).toBe(1);
    expect(preview.summary.invalid).toBe(1);

    /* Lines 2 and 3 of the file, because line 1 is the header. These used to
       be 1 and 2 — the position among the rows that parsed, which is not a
       number the reader can act on and was off by the header plus any blank
       line. */
    const invalidRow = preview.rows.find((r: { rowNumber: number }) => r.rowNumber === 3);
    expect(invalidRow.valid).toBe(false);
    expect(invalidRow.errors[0]).toMatchObject({ field: "Scenario Name" });

    const validRow = preview.rows.find((r: { rowNumber: number }) => r.rowNumber === 2);
    expect(validRow.valid).toBe(true);

    const scenarioCount = await prisma.scenario.count({ where: { projectId: project.id } });
    expect(scenarioCount).toBe(0);
  });

  it("flags a duplicate when a Test Case with the same name already exists under the matched Test Group", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const csv = [
      CSV_HEADER,
      csvRow({
        "Project Code": project.code,
        "Scenario Name": "Login Flow",
        "Test Group Name": "Functional",
        "Test Case Name": "Valid login",
        "Test Steps": "Enter credentials",
        "Expected Result": "User reaches dashboard",
        Priority: "HIGH",
      }),
    ].join("\n");

    // First import creates the Scenario/Test Group/Test Case.
    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [
          {
            rowNumber: 1,
            data: {
              rowNumber: 1,
              projectCode: project.code,
              scenarioName: "Login Flow",
              testGroupName: "Functional",
              testCaseName: "Valid login",
              preconditions: "",
              testSteps: "Enter credentials",
              expectedResult: "User reaches dashboard",
              priority: "HIGH",
            },
          },
        ],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    // Second validate of the same row should now flag it as a duplicate.
    const response = await validateImportRoute(
      csvRequest(`http://test/api/projects/${project.id}/import/validate`, csv),
      { params: Promise.resolve({ id: project.id }) },
    );
    const preview = await response.json();
    expect(preview.rows[0].duplicate).toBe(true);
    expect(preview.rows[0].existingTestCaseId).toBeDefined();
  });

  it("confirm produces accurate summary counts and records resolution choices in ImportLog", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const rowData = (name: string) => ({
      rowNumber: 1,
      projectCode: project.code,
      scenarioName: "Scenario",
      testGroupName: "Group",
      testCaseName: name,
      preconditions: "",
      testSteps: "Step",
      expectedResult: "Result",
      priority: "MEDIUM",
    });

    const first = await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data: rowData("Case A") }],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    const firstSummary = await first.json();
    expect(firstSummary).toMatchObject({ succeededCount: 1, failedCount: 0, skippedCount: 0 });

    const second = await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [
          { rowNumber: 1, data: rowData("Case A"), duplicateResolution: "skip" },
          { rowNumber: 2, data: rowData("Case B") },
        ],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    const secondSummary = await second.json();
    expect(secondSummary).toMatchObject({ succeededCount: 1, failedCount: 0, skippedCount: 1 });

    const importLog = await prisma.importLog.findUnique({
      where: { id: secondSummary.importLogId },
    });
    expect(importLog?.details).toEqual([
      { rowNumber: 1, outcome: "skipped", testCaseId: expect.any(String) },
      { rowNumber: 2, outcome: "created", testCaseId: expect.any(String) },
    ]);

    const testCaseCount = await prisma.testCase.count({
      where: { testGroup: { scenario: { projectId: project.id } } },
    });
    expect(testCaseCount).toBe(2);

    const skipAuditEntries = await prisma.auditLog.count({
      where: { projectId: project.id, action: "import-skip" },
    });
    expect(skipAuditEntries).toBe(1);
  });

  it("is atomic: a row that still fails validation at confirm time leaves no partial rows written", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const goodRow = {
      rowNumber: 1,
      projectCode: project.code,
      scenarioName: "Scenario",
      testGroupName: "Group",
      testCaseName: "Good case",
      preconditions: "",
      testSteps: "Step",
      expectedResult: "Result",
      priority: "MEDIUM",
    };
    const badRow = { ...goodRow, rowNumber: 2, testCaseName: "", scenarioName: "" };

    const response = await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [
          { rowNumber: 1, data: goodRow },
          { rowNumber: 2, data: badRow },
        ],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.rowNumber).toBe(2);

    const scenarioCount = await prisma.scenario.count({ where: { projectId: project.id } });
    expect(scenarioCount).toBe(0);
    const importLogCount = await prisma.importLog.count({ where: { projectId: project.id } });
    expect(importLogCount).toBe(0);
  });

  it("returns 403 for a non-member on validate and confirm", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    const outsider = await createUser(uniqueEmail("imp-outsider"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    mockAuth.mockResolvedValue(sessionFor(outsider.id) as never);
    const params = Promise.resolve({ id: project.id });

    const validateResponse = await validateImportRoute(
      csvRequest(`http://test/api/projects/${project.id}/import/validate`, CSV_HEADER),
      { params },
    );
    expect(validateResponse.status).toBe(403);

    const confirmResponse = await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", { rows: [] }),
      { params },
    );
    expect(confirmResponse.status).toBe(403);
  });

  it("succeeds when a row's data is fixed (edited inline) before confirm, even though it originally failed validation", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const brokenRow = {
      rowNumber: 1,
      projectCode: project.code,
      scenarioName: "",
      testGroupName: "Group",
      testCaseName: "Case",
      preconditions: "",
      testSteps: "Step",
      expectedResult: "Result",
      priority: "MEDIUM",
    };

    // Simulates the UI: the user edited the previously-empty scenarioName
    // inline and unchecked "skip" before confirming.
    const fixedRow = { ...brokenRow, scenarioName: "Fixed Scenario" };

    const response = await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data: fixedRow, skip: false }],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );
    expect(response.status).toBe(200);
    const summary = await response.json();
    expect(summary).toMatchObject({ succeededCount: 1, failedCount: 0, skippedCount: 0 });

    const scenario = await prisma.scenario.findFirst({
      where: { projectId: project.id, name: "Fixed Scenario" },
    });
    expect(scenario).not.toBeNull();
  });

  it("sets Scenario/Test Group narrative fields from the new columns only when the row creates them", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const rowData = (testCaseName: string, overrides: Record<string, string> = {}) => ({
      rowNumber: 1,
      projectCode: project.code,
      scenarioName: "Scenario",
      testGroupName: "Group",
      testCaseName,
      preconditions: "",
      testSteps: "Step",
      expectedResult: "Case-level result",
      priority: "MEDIUM",
      scenarioDescription: "Scenario objective",
      scenarioPreconditions: "Scenario precondition",
      scenarioExpectedResult: "Scenario-level result",
      testGroupObjective: "Group objective",
      ...overrides,
    });

    // First row creates both the Scenario and the Test Group — narrative fields should be set.
    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data: rowData("Case A") }],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const scenario = await prisma.scenario.findFirst({ where: { projectId: project.id, name: "Scenario" } });
    expect(scenario).toMatchObject({
      description: "Scenario objective",
      preconditions: "Scenario precondition",
      expectedResult: "Scenario-level result",
    });

    const testGroup = await prisma.testGroup.findFirst({ where: { scenarioId: scenario!.id, name: "Group" } });
    expect(testGroup).toMatchObject({ testObjective: "Group objective" });

    // Second row reuses the same (already-existing) Scenario/Test Group with
    // different narrative-field values — those must NOT overwrite the container.
    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [
          {
            rowNumber: 1,
            data: rowData("Case B", {
              scenarioDescription: "Different objective",
              scenarioPreconditions: "Different precondition",
              scenarioExpectedResult: "Different result",
              testGroupObjective: "Different group objective",
            }),
          },
        ],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const scenarioAfter = await prisma.scenario.findFirst({
      where: { projectId: project.id, name: "Scenario" },
    });
    expect(scenarioAfter).toMatchObject({
      description: "Scenario objective",
      preconditions: "Scenario precondition",
      expectedResult: "Scenario-level result",
    });

    const testGroupAfter = await prisma.testGroup.findFirst({
      where: { scenarioId: scenario!.id, name: "Group" },
    });
    expect(testGroupAfter).toMatchObject({ testObjective: "Group objective" });
  });

  it("falls back to the row's own Expected Result for a new Scenario when Scenario Expected Result is blank", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const rowData = {
      rowNumber: 1,
      projectCode: project.code,
      scenarioName: "Scenario",
      testGroupName: "Group",
      testCaseName: "Case",
      preconditions: "",
      testSteps: "Step",
      expectedResult: "Case-level result",
      priority: "MEDIUM",
      scenarioDescription: "",
      scenarioPreconditions: "",
      scenarioExpectedResult: "",
      testGroupObjective: "",
    };

    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data: rowData }],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const scenario = await prisma.scenario.findFirst({ where: { projectId: project.id, name: "Scenario" } });
    expect(scenario).toMatchObject({
      description: null,
      preconditions: null,
      expectedResult: "Case-level result",
    });
  });

  it("writes an AuditLog entry when a duplicate row is explicitly skipped", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const rowData = {
      rowNumber: 1,
      projectCode: project.code,
      scenarioName: "Scenario",
      testGroupName: "Group",
      testCaseName: "Existing case",
      preconditions: "",
      testSteps: "Step",
      expectedResult: "Result",
      priority: "MEDIUM",
    };

    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data: rowData }],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data: rowData, duplicateResolution: "skip" }],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const skipEntry = await prisma.auditLog.findFirst({
      where: { projectId: project.id, entityType: "TestCase", action: "import-skip" },
    });
    expect(skipEntry).not.toBeNull();
    expect(skipEntry?.entityId).toBeTruthy();
  });

  it("creates the named Module and Requirement from the sheet, and files the Scenario under them", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const rowData = {
      rowNumber: 1,
      projectCode: project.code,
      moduleName: "Authentication",
      requirementName: "REQ-001 Users can sign in",
      scenarioName: "Scenario",
      testGroupName: "Group",
      testCaseName: "Case",
      preconditions: "",
      testSteps: "Step",
      expectedResult: "Result",
      priority: "MEDIUM",
    };

    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data: rowData }],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const mod = await prisma.module.findFirst({
      where: { projectId: project.id, name: "Authentication" },
    });
    expect(mod).not.toBeNull();

    const requirement = await prisma.requirement.findFirst({
      where: { projectId: project.id, moduleId: mod!.id, name: "REQ-001 Users can sign in" },
    });
    expect(requirement).not.toBeNull();

    const scenario = await prisma.scenario.findFirst({
      where: { projectId: project.id, name: "Scenario" },
    });
    expect(scenario?.requirementId).toBe(requirement!.id);
  });

  it("falls back to an Unassigned Module and Requirement when both columns are blank", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const rowData = {
      rowNumber: 1,
      projectCode: project.code,
      scenarioName: "Scenario",
      testGroupName: "Group",
      testCaseName: "Case",
      preconditions: "",
      testSteps: "Step",
      expectedResult: "Result",
      priority: "MEDIUM",
    };

    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data: rowData }],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const mod = await prisma.module.findFirst({
      where: { projectId: project.id, name: UNASSIGNED_NAME },
    });
    expect(mod).not.toBeNull();

    const requirement = await prisma.requirement.findFirst({
      where: { projectId: project.id, moduleId: mod!.id, name: UNASSIGNED_NAME },
    });
    expect(requirement).not.toBeNull();

    const scenario = await prisma.scenario.findFirst({
      where: { projectId: project.id, name: "Scenario" },
    });
    expect(scenario?.requirementId).toBe(requirement!.id);
  });

  it("makes one Test Step per line of the Test Steps cell", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const rowData = {
      rowNumber: 1,
      projectCode: project.code,
      moduleName: "Governance",
      requirementName: "REQ-SEMANTIC-001",
      scenarioName: "Scenario",
      testGroupName: "Navigation",
      testCaseName: "Open the Semantic Type page",
      preconditions: "",
      // What a spreadsheet actually contains: a numbered list, either typed
      // with Alt+Enter or run together on one line.
      testSteps: "1. Open the Governance menu\n2. Choose Semantic Type",
      expectedResult: "The Semantic Type page is listed",
      priority: "HIGH",
    };

    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data: rowData }],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const testCase = await prisma.testCase.findFirstOrThrow({
      where: { name: "Open the Semantic Type page" },
      include: { steps: { orderBy: { sequence: "asc" } } },
    });

    // Two rows, not one row holding a line break — and without the sheet's own
    // numbering, which the dialog would otherwise print on top of its own.
    expect(testCase.steps).toHaveLength(2);
    expect(testCase.steps[0]).toMatchObject({
      sequence: 1,
      step: "Open the Governance menu",
    });
    expect(testCase.steps[1]).toMatchObject({
      sequence: 2,
      step: "Choose Semantic Type",
    });

    // The sheet has one Expected Result, describing the outcome once the whole
    // thing has been carried out, so it sits on the last step rather than
    // being repeated against each.
    expect(testCase.steps[0].expectedResult).toBe("");
    expect(testCase.steps[1].expectedResult).toBe("The Semantic Type page is listed");
  });

  it("still makes a single step from a single-line cell", async () => {
    const owner = await createUser(uniqueEmail("imp-owner"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${project.id}/import/confirm`, "POST", {
        rows: [
          {
            rowNumber: 1,
            data: {
              rowNumber: 1,
              projectCode: project.code,
              moduleName: "",
              requirementName: "",
              scenarioName: "Scenario",
              testGroupName: "Group",
              testCaseName: "One step only",
              preconditions: "",
              testSteps: "Enter valid credentials and click Login",
              expectedResult: "Result",
              priority: "MEDIUM",
            },
          },
        ],
      }),
      { params: Promise.resolve({ id: project.id }) },
    );

    const testCase = await prisma.testCase.findFirstOrThrow({
      where: { name: "One step only" },
      include: { steps: true },
    });
    expect(testCase.steps).toHaveLength(1);
    expect(testCase.steps[0]).toMatchObject({
      sequence: 1,
      step: "Enter valid credentials and click Login",
      expectedResult: "Result",
    });
  });
  /* The three Requirement columns. Unlike every other level, these are
   * written to a Requirement that already exists — the sheet is where they
   * are maintained, so a second import is how a correction arrives. */

  function requirementRow(overrides: Record<string, string> = {}) {
    return {
      rowNumber: 1,
      projectCode: overrides.projectCode ?? "",
      moduleName: "Data Sharing",
      requirementName: "Users can reach the dashboard",
      scenarioName: "Scenario",
      testGroupName: "Group",
      testCaseName: "Case",
      preconditions: "",
      testSteps: "Step",
      expectedResult: "Result",
      priority: "MEDIUM",
      requirementCode: "",
      requirementDescription: "",
      requirementFeature: "",
      ...overrides,
    };
  }

  async function confirmRow(projectId: string, data: Record<string, unknown>) {
    return confirmImportRoute(
      jsonRequest(`http://test/api/projects/${projectId}/import/confirm`, "POST", {
        rows: [{ rowNumber: 1, data }],
      }),
      { params: Promise.resolve({ id: projectId }) },
    );
  }

  it("sets a new Requirement's Code, Description and Feature from the sheet", async () => {
    const owner = await createUser(uniqueEmail("imp-req"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    await confirmRow(
      project.id,
      requirementRow({
        projectCode: project.code,
        requirementCode: "REQ-DSD-001",
        requirementDescription: "The user reaches the dashboard and picks a Domain.",
        requirementFeature: "Sharing Dashboard",
      }),
    );

    const requirement = await prisma.requirement.findFirstOrThrow({
      where: { projectId: project.id, name: "Users can reach the dashboard" },
    });
    expect(requirement).toMatchObject({
      code: "REQ-DSD-001",
      description: "The user reaches the dashboard and picks a Domain.",
      feature: "Sharing Dashboard",
    });
  });

  it("updates those fields on a Requirement that already exists, and records what changed", async () => {
    const owner = await createUser(uniqueEmail("imp-req"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    await confirmRow(
      project.id,
      requirementRow({ projectCode: project.code, requirementCode: "REQ-001" }),
    );
    await confirmRow(
      project.id,
      requirementRow({
        projectCode: project.code,
        requirementCode: "REQ-DSD-001",
        requirementDescription: "Corrected in the sheet.",
      }),
    );

    const requirements = await prisma.requirement.findMany({
      where: { projectId: project.id, name: "Users can reach the dashboard" },
    });
    // Corrected in place — not a second Requirement alongside the first.
    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({
      code: "REQ-DSD-001",
      description: "Corrected in the sheet.",
    });

    const entries = await prisma.auditLog.findMany({
      where: { entityType: "Requirement", entityId: requirements[0].id, action: "import-update" },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].oldValue).toEqual({ code: "REQ-001", description: null });
    expect(entries[0].newValue).toEqual({
      code: "REQ-DSD-001",
      description: "Corrected in the sheet.",
    });
  });

  it("leaves a stored value alone when the sheet's cell is blank", async () => {
    const owner = await createUser(uniqueEmail("imp-req"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    await confirmRow(
      project.id,
      requirementRow({
        projectCode: project.code,
        requirementCode: "REQ-DSD-001",
        requirementDescription: "Written the first time.",
        requirementFeature: "Sharing Dashboard",
      }),
    );

    // An older sheet, from before these columns existed: every one blank.
    await confirmRow(project.id, requirementRow({ projectCode: project.code }));

    const requirement = await prisma.requirement.findFirstOrThrow({
      where: { projectId: project.id, name: "Users can reach the dashboard" },
    });
    expect(requirement).toMatchObject({
      code: "REQ-DSD-001",
      description: "Written the first time.",
      feature: "Sharing Dashboard",
    });
  });

  it("writes no audit entry when the sheet repeats what is already stored", async () => {
    const owner = await createUser(uniqueEmail("imp-req"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    const row = requirementRow({
      projectCode: project.code,
      requirementCode: "REQ-DSD-001",
      requirementDescription: "Unchanged.",
    });
    await confirmRow(project.id, row);
    await confirmRow(project.id, row);

    const requirement = await prisma.requirement.findFirstOrThrow({
      where: { projectId: project.id, name: "Users can reach the dashboard" },
    });
    const entries = await prisma.auditLog.findMany({
      where: { entityType: "Requirement", entityId: requirement.id, action: "import-update" },
    });
    expect(entries).toHaveLength(0);
  });

  it("round-trips all three through export and back", async () => {
    const owner = await createUser(uniqueEmail("imp-req"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject();

    await confirmRow(
      project.id,
      requirementRow({
        projectCode: project.code,
        requirementCode: "REQ-DSD-001",
        requirementDescription: "Survives the round trip.",
        requirementFeature: "Sharing Dashboard",
      }),
    );

    const rows = await getProjectHierarchyRows(project.id, project.code);
    expect(rows).toHaveLength(1);

    const byColumn = Object.fromEntries(IMPORT_COLUMNS.map((column, i) => [column, rows[0][i]]));
    expect(byColumn["Requirement Code"]).toBe("REQ-DSD-001");
    expect(byColumn["Requirement Description"]).toBe("Survives the round trip.");
    expect(byColumn["Requirement Feature"]).toBe("Sharing Dashboard");
  });
});

/**
 * Four levels of container, one question: what should an import do when the
 * thing the sheet names is already there but archived?
 *
 * The Module level answered "reuse it, and bring it back" — its comment argues
 * that filing rows under a hidden parent puts them somewhere no list shows.
 * The three levels below answered "do not see it", and so made a second one
 * with the same name beside the archived one. One function, two answers, and
 * a project somebody had tidied up grew duplicates on the next import.
 */
describe("importing into something that was archived", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  function row(projectCode: string, testCaseName: string) {
    return {
      rowNumber: 1,
      data: {
        rowNumber: 1,
        projectCode,
        moduleName: "Policy",
        requirementName: "Users can reach the dashboard",
        scenarioName: "Login Flow",
        testGroupName: "Functional",
        testCaseName,
        preconditions: "",
        testSteps: "1. do it",
        expectedResult: "ok",
        priority: "HIGH",
        scenarioDescription: "",
        scenarioPreconditions: "",
        scenarioExpectedResult: "",
        testGroupObjective: "",
        requirementCode: "",
        requirementDescription: "",
        requirementFeature: "",
      },
    };
  }

  async function confirm(projectId: string, rows: unknown[]) {
    const response = await confirmImportRoute(
      jsonRequest(`http://test/api/projects/${projectId}/import/confirm`, "POST", { rows }),
      { params: Promise.resolve({ id: projectId }) },
    );
    return response.json();
  }

  async function signedInProject() {
    const owner = await createUser(uniqueEmail("imp-arch"));
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    return createProject();
  }

  it("reuses all four levels rather than making a twin of each", async () => {
    const project = await signedInProject();
    await confirm(project.id, [row(project.code, "first case")]);

    const archived = { deletedAt: new Date() };
    await prisma.module.updateMany({ where: { projectId: project.id }, data: archived });
    await prisma.requirement.updateMany({ where: { projectId: project.id }, data: archived });
    await prisma.scenario.updateMany({ where: { projectId: project.id }, data: archived });
    await prisma.testGroup.updateMany({
      where: { scenario: { projectId: project.id } },
      data: archived,
    });

    const summary = await confirm(project.id, [row(project.code, "second case")]);

    const inProject = { projectId: project.id };
    const levels = {
      module: await prisma.module.findMany({ where: inProject }),
      requirement: await prisma.requirement.findMany({ where: inProject }),
      scenario: await prisma.scenario.findMany({ where: inProject }),
      testGroup: await prisma.testGroup.findMany({
        where: { scenario: { projectId: project.id } },
      }),
    };

    // One of each, not two, and none of them still hidden.
    for (const [label, rows] of Object.entries(levels)) {
      expect(rows, label).toHaveLength(1);
      expect(rows[0].deletedAt, label).toBeNull();
    }

    // And it says so, rather than resurrecting them quietly.
    expect(summary.restoredCounts).toEqual({
      modules: 1,
      requirements: 1,
      scenarios: 1,
      testGroups: 1,
    });
  });

  it("reports nothing restored when nothing was archived", async () => {
    const project = await signedInProject();
    const summary = await confirm(project.id, [row(project.code, "only case")]);

    expect(summary.restoredCounts).toEqual({
      modules: 0,
      requirements: 0,
      scenarios: 0,
      testGroups: 0,
    });
  });
});
