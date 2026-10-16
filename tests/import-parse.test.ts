import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { IMPORT_COLUMNS, generateImportTemplateCsv, parseImportFile } from "@/lib/import/parse";

/**
 * The file reading itself, apart from what the import then does with it.
 */
describe("the template somebody downloads to start from", () => {
  it("has one example value under every column it declares", async () => {
    /* It had fourteen under seventeen headers, and the three it left out were
     * Requirement Code, Description and Feature — the ones the row type
     * describes as "maintained through the sheet", so the ones most in need
     * of showing. The comment beside the row claimed they lined up. */
    const [header, example] = generateImportTemplateCsv().trim().split("\n");
    const rows = await parseImportFile(
      Buffer.from(`${header}\n${example}\n`),
      "template.csv",
    );

    expect(header.split(",")).toHaveLength(IMPORT_COLUMNS.length);
    const [row] = rows;
    expect(row.requirementCode).not.toBe("");
    expect(row.requirementDescription).not.toBe("");
    expect(row.requirementFeature).not.toBe("");
  });

  it("survives being read back by the parser that will read it", async () => {
    const rows = await parseImportFile(Buffer.from(generateImportTemplateCsv()), "template.csv");
    expect(rows).toHaveLength(1);
    expect(rows[0].projectCode).toBe("PRJ-001");
    expect(rows[0].priority).toBe("HIGH");
  });
});

describe("which row the reader is told to go and fix", () => {
  const HEADER =
    "Project Code,Module,Requirement Name,Scenario Name,Test Group Name,Test Case Name," +
    "Preconditions,Test Steps,Expected Result,Priority";

  it("counts lines in the file, not rows that survived parsing", async () => {
    /* A header and a blank line between groups is what a person actually
     * produces. Before this the third case reported "Row 3" while sitting on
     * line 5, and that number is what every error message and the remove-row
     * button point at. */
    const csv = [
      HEADER,
      "P,M,R,S,G,first,,step,result,HIGH",
      "",
      "P,M,R,S,G,second,,step,result,HIGH",
      "P,M,R,S,G,third,,step,result,HIGH",
    ].join("\n");

    const rows = await parseImportFile(Buffer.from(csv), "x.csv");

    expect(rows.map((r) => [r.rowNumber, r.testCaseName])).toEqual([
      [2, "first"],
      [4, "second"],
      [5, "third"],
    ]);
  });

  it("reports the spreadsheet's own row numbers for an xlsx", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(HEADER.split(","));
    sheet.addRow(["P", "M", "R", "S", "G", "first", "", "step", "result", "HIGH"]);
    sheet.addRow([]);
    sheet.addRow(["P", "M", "R", "S", "G", "second", "", "step", "result", "HIGH"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const rows = await parseImportFile(buffer, "x.xlsx");

    // Row 2 and row 4 are what the reader sees down the side of the sheet.
    expect(rows.map((r) => [r.rowNumber, r.testCaseName])).toEqual([
      [2, "first"],
      [4, "second"],
    ]);
  });
});
