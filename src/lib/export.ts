import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { IMPORT_COLUMNS } from "@/lib/import/parse";
import type { ProjectDashboard } from "@/lib/dashboard";
import type { listRunResultsForExport } from "@/lib/test-runs";

/**
 * Escapes a CSV cell, and neutralizes "CSV injection" first: a cell opened
 * in Excel/Sheets/LibreOffice that starts with `=`, `+`, `-`, or `@` is read
 * as a formula, not literal text — a Test Case/Requirement/Scenario named
 * `=HYPERLINK("http://evil","click")` would execute the moment whoever
 * exports the project opens the file. A leading `'` is the standard
 * mitigation (OWASP's own recommendation): Excel treats it as "force this
 * cell to text" and hides the quote; a value that legitimately started with
 * one of those characters keeps a visible leading `'` in other viewers,
 * which is the accepted trade-off for not executing arbitrary formulas.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

/**
 * Every live row of the project's hierarchy, in `IMPORT_COLUMNS` order — the
 * file this produces can be fed straight back into the CSV/XLSX import. A
 * Scenario or Test Group with no Test Cases under it has no row to carry it
 * (the import format is one row per Test Case), so it's left out here too.
 */
export async function getProjectHierarchyRows(projectId: string, projectCode: string) {
  const modules = await prisma.module.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { sequence: "asc" },
    include: {
      requirements: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          scenarios: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: {
              testGroups: {
                where: { deletedAt: null },
                orderBy: { sequence: "asc" },
                include: {
                  testCases: {
                    where: { deletedAt: null },
                    orderBy: { createdAt: "asc" },
                    include: { steps: { orderBy: { sequence: "asc" } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const rows: string[][] = [];
  for (const mod of modules) {
    for (const requirement of mod.requirements) {
      // Same "once per container" rule as the Scenario fields below, one level
      // up: repeating a Requirement's description on all 40 of its rows would
      // be noise in the sheet someone has to edit.
      let requirementIntroduced = false;
      for (const scenario of requirement.scenarios) {
        // "Creation-only" fields (Scenario/Test Group description etc.) go on
        // only the first row that introduces that container — matching how
        // the import treats a repeated Scenario/Test Group Name as a find,
        // not a second create.
        let scenarioIntroduced = false;
        for (const testGroup of scenario.testGroups) {
          let testGroupIntroduced = false;
          for (const testCase of testGroup.testCases) {
            rows.push([
              projectCode,
              mod.name,
              requirement.name,
              scenario.name,
              testGroup.name,
              testCase.name,
              testCase.preconditions ?? "",
              testCase.steps.map((step) => step.step).join("\n"),
              testCase.expectedResult,
              testCase.priority,
              scenarioIntroduced ? "" : scenario.description ?? "",
              scenarioIntroduced ? "" : scenario.preconditions ?? "",
              scenarioIntroduced ? "" : scenario.expectedResult,
              testGroupIntroduced ? "" : testGroup.testObjective ?? "",
              requirementIntroduced ? "" : requirement.code ?? "",
              requirementIntroduced ? "" : requirement.description ?? "",
              requirementIntroduced ? "" : requirement.feature ?? "",
            ]);
            requirementIntroduced = true;
            scenarioIntroduced = true;
            testGroupIntroduced = true;
          }
        }
      }
    }
  }
  return rows;
}

export function generateProjectHierarchyCsv(rows: string[][]): string {
  return toCsv([[...IMPORT_COLUMNS], ...rows]);
}

/** A real .xlsx cell carries its own type in the file's XML, unlike a CSV
 *  cell (plain text a spreadsheet app has to guess about) — so a string
 *  value here isn't at risk of being reinterpreted as a formula the way
 *  `csvCell` guards against. The same leading-character prefix is still
 *  applied, cheaply, so this doesn't rely on that distinction holding in
 *  every application that might open the file. */
function xlsxCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export async function generateProjectHierarchyXlsx(rows: string[][]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import");
  sheet.addRow([...IMPORT_COLUMNS]);
  rows.forEach((row) => sheet.addRow(row.map(xlsxCell)));
  return workbook.xlsx.writeBuffer();
}

const RUN_RESULTS_HEADER = [
  "Module",
  "Requirement",
  "Scenario",
  "Test Group",
  "Test Case",
  "Priority",
  "Result",
  "Notes",
  "Ran By",
  "Ran At",
];

export function generateRunResultsCsv(
  cases: Awaited<ReturnType<typeof listRunResultsForExport>>,
): string {
  const rows = cases.map((testRunCase) => {
    const { testCase } = testRunCase;
    return [
      testCase.testGroup.scenario.requirement.module.name,
      testCase.testGroup.scenario.requirement.name,
      testCase.testGroup.scenario.name,
      testCase.testGroup.name,
      testCase.name,
      testCase.priority,
      testRunCase.testResult,
      testRunCase.notes ?? "",
      testRunCase.ranBy?.name ?? "",
      testRunCase.ranAt ? testRunCase.ranAt.toISOString() : "",
    ];
  });
  return toCsv([RUN_RESULTS_HEADER, ...rows]);
}

export function generateDashboardSummaryCsv(
  dashboard: ProjectDashboard,
  projectName: string,
): string {
  const rows: string[][] = [
    ["Project", projectName],
    [],
    ["Metric", "Count"],
    ["Modules", String(dashboard.counts.modules)],
    ["Requirements", String(dashboard.counts.requirements)],
    ["Scenarios", String(dashboard.counts.scenarios)],
    ["Test Groups", String(dashboard.counts.testGroups)],
    ["Test Cases", String(dashboard.counts.testCases)],
    ["Test Progress %", String(dashboard.testProgress)],
    [],
    ["Test Cases by Result"],
    ...Object.entries(dashboard.testCasesByResult).map(([result, count]) => [
      result,
      String(count),
    ]),
    [],
    ["Test Cases by Priority"],
    ...Object.entries(dashboard.testCasesByPriority).map(([priority, count]) => [
      priority,
      String(count),
    ]),
    [],
    ["Coverage"],
    ["In any run", String(dashboard.coverage.inAnyRun)],
    ["Not in any run", String(dashboard.coverage.notInAnyRun)],
  ];
  return toCsv(rows);
}
