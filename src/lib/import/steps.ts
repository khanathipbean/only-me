/**
 * How a Test Steps cell becomes Test Steps.
 *
 * Its own module, away from `parse.ts`, because the import preview in the
 * browser needs it too and `parse.ts` pulls in `exceljs` and `csv-parse` —
 * Node-only packages that would be dragged into the client bundle by a single
 * import. The count shown under the field must come from the same function
 * the server uses, or it is a second opinion that can quietly disagree.
 */

/**
 * One line of the cell is one step.
 *
 * `splitNumberedSteps` (in `parse.ts`, at read time) already turns a run-on
 * "1. Do X 2. Do Y" cell into one line per step. The importer then stored the
 * whole thing as a single step whose text happened to contain line breaks, and
 * since the Edit dialog numbers steps itself, all of them showed as step 1
 * with the sheet's own "1." and "2." buried in the text.
 *
 * The marker at the front of a line is dropped: the sequence already says
 * which step this is, and keeping both reads as "1. 1.". A cell with a single
 * line still produces exactly one step, which is what every import before
 * this did.
 */
const LEADING_MARKER = /^\s*(?:\d+\s*[.)\]]|[-*•–—])\s*/;

export function parseTestSteps(cell: string): string[] {
  const lines = cell
    .split("\n")
    .map((line) => line.replace(/\r$/, "").replace(LEADING_MARKER, "").trim())
    .filter(Boolean);

  // A cell that is nothing but markers ("1." on its own) would otherwise leave
  // a Test Case with no steps at all; keep what was written instead.
  return lines.length > 0 ? lines : [cell.trim()];
}
