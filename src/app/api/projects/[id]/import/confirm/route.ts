import { NextResponse } from "next/server";
import { withProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { ImportRowFailedError, confirmImport } from "@/lib/import/service";
import { notifyProject } from "@/lib/notifications";

const COUNT_LABELS: Record<string, string> = {
  modules: "module",
  requirements: "requirement",
  scenarios: "scenario",
  testGroups: "test group",
  testCases: "test case",
};

function list(counts: Record<string, number>) {
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${COUNT_LABELS[key]}${count === 1 ? "" : "s"}`);
  if (parts.length <= 1) {
    return parts[0];
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "28 requirements and 12 test cases" — only the levels that actually got a
 * new row, so an import that only updated existing Test Cases doesn't claim
 * to have created anything. An import can now also correct a Requirement that
 * already existed, which creates nothing: reporting only the created counts
 * would call that "No new items were created" and read as if the file had
 * been ignored. */
function describeCounts(created: Record<string, number>, updated: Record<string, number>) {
  const sentences: string[] = [];
  const createdList = list(created);
  const updatedList = list(updated);
  if (createdList) {
    sentences.push(`Imported ${createdList}.`);
  }
  if (updatedList) {
    sentences.push(`Updated ${updatedList}.`);
  }
  return sentences.length > 0 ? sentences.join(" ") : "No new items were created.";
}

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

    await notifyProject({
      projectId,
      type: "IMPORT_COMPLETED",
      title: `Import completed for ${project.code}`,
      body: describeCounts(summary.createdCounts, summary.updatedCounts),
      link: `/projects/${projectId}/audit-log`,
      actorId: userId,
      excludeUserId: userId,
    });

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
