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
  const rows = await parseImportFile(buffer, file.name);

  const preview = await previewImport(projectId, project.code, rows);
  return NextResponse.json(preview);
});
