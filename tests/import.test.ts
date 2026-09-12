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

const mockAuth = vi.mocked(auth);

function sessionFor(userId: string) {
  return {
    user: { id: userId, email: `${userId}@example.com` },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

async function createUser(email: string) {
  return prisma.user.create({
    data: { email, passwordHash: "irrelevant", name: email },
  });
}

function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

function csvRequest(url: string, csvContent: string, fileName = "import.csv") {
  const formData = new FormData();
  formData.append("file", new File([csvContent], fileName, { type: "text/csv" }));
  return new NextRequest(url, { method: "POST", body: formData });
}

async function createProject(code: string) {
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
    const user = await createUser("imp-owner1@example.com");
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
    const owner = await createUser("imp-owner2@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-2");
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
    const owner = await createUser("imp-owner3@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-3");

    const csv = [
      CSV_HEADER,
      csvRow({
        "Project Code": "PRJ-IMP-3",
        "Scenario Name": "Login Flow",
        "Test Group Name": "Functional",
        "Test Case Name": "Valid login",
        "Test Steps": "Enter credentials",
        "Expected Result": "User reaches dashboard",
        Priority: "HIGH",
      }),
      csvRow({
        "Project Code": "PRJ-IMP-3",
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

    const invalidRow = preview.rows.find((r: { rowNumber: number }) => r.rowNumber === 2);
    expect(invalidRow.valid).toBe(false);
    expect(invalidRow.errors[0]).toMatchObject({ field: "Scenario Name" });

    const validRow = preview.rows.find((r: { rowNumber: number }) => r.rowNumber === 1);
    expect(validRow.valid).toBe(true);

    const scenarioCount = await prisma.scenario.count({ where: { projectId: project.id } });
    expect(scenarioCount).toBe(0);
  });

  it("flags a duplicate when a Test Case with the same name already exists under the matched Test Group", async () => {
    const owner = await createUser("imp-owner4@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-4");

    const csv = [
      CSV_HEADER,
      csvRow({
        "Project Code": "PRJ-IMP-4",
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
              projectCode: "PRJ-IMP-4",
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
    const owner = await createUser("imp-owner5@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-5");

    const rowData = (name: string) => ({
      rowNumber: 1,
      projectCode: "PRJ-IMP-5",
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
    const owner = await createUser("imp-owner6@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-6");

    const goodRow = {
      rowNumber: 1,
      projectCode: "PRJ-IMP-6",
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
    const owner = await createUser("imp-owner7@example.com");
    const outsider = await createUser("imp-outsider1@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-7");

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
    const owner = await createUser("imp-owner8@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-8");

    const brokenRow = {
      rowNumber: 1,
      projectCode: "PRJ-IMP-8",
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
    const owner = await createUser("imp-owner10@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-10");

    const rowData = (testCaseName: string, overrides: Record<string, string> = {}) => ({
      rowNumber: 1,
      projectCode: "PRJ-IMP-10",
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
    const owner = await createUser("imp-owner11@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-11");

    const rowData = {
      rowNumber: 1,
      projectCode: "PRJ-IMP-11",
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
    const owner = await createUser("imp-owner9@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-9");

    const rowData = {
      rowNumber: 1,
      projectCode: "PRJ-IMP-9",
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
    const owner = await createUser("imp-owner12@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-12");

    const rowData = {
      rowNumber: 1,
      projectCode: "PRJ-IMP-12",
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
    const owner = await createUser("imp-owner13@example.com");
    mockAuth.mockResolvedValue(sessionFor(owner.id) as never);
    const project = await createProject("PRJ-IMP-13");

    const rowData = {
      rowNumber: 1,
      projectCode: "PRJ-IMP-13",
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
});
