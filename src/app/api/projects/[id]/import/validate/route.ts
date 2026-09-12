import { NextResponse } from "next/server";
import { withProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { isSupportedImportFile, parseImportFile } from "@/lib/import/parse";
import { MAX_IMPORT_FILE_SIZE_BYTES, previewImport } from "@/lib/import/service";

export const POST = withProjectRole(EDITOR_ROLES, async (request, { projectId }) => {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!isSupportedImportFile(file.name)) {
    return NextResponse.json(
      { error: "Unsupported file type: only .csv and .xlsx are accepted" },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File is too large: the limit is ${MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)}MB` },
      { status: 400 },
    );
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let rows;
  try {
    rows = await parseImportFile(buffer, file.name);
  } catch (err) {
    // A malformed/corrupted file (e.g. a renamed .csv, or a CSV whose columns
    // don't match the template) throws from csv-parse/ExcelJS — without this,
    // that propagated as an uncaught 500 with no JSON body, which crashed the
    // wizard's `response.json()` call with an opaque "Unexpected end of JSON
    // input" instead of showing the user what was actually wrong.
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Could not read the file: ${message}` },
      { status: 400 },
    );
  }

  const preview = await previewImport(projectId, project.code, rows);
  return NextResponse.json(preview);
});
