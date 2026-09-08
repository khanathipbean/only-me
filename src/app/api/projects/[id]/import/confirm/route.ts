import { NextResponse } from "next/server";
import { withProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { ImportRowFailedError, confirmImport } from "@/lib/import/service";

export const POST = withProjectRole(EDITOR_ROLES, async (request, { projectId, userId }) => {
  const body = await request.json();
  const rows = body.rows;

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const summary = await confirmImport(projectId, project.code, rows, userId);
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof ImportRowFailedError) {
      return NextResponse.json(
        {
          error: `Row ${error.rowNumber} still has validation errors — fix or skip it before confirming`,
          rowNumber: error.rowNumber,
          errors: error.errors,
        },
        { status: 400 },
      );
    }
    throw error;
  }
});
