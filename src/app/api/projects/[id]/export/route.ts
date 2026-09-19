import { NextResponse } from "next/server";
import { checkProjectRole, requireApiSession } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import {
  generateProjectHierarchyCsv,
  generateProjectHierarchyXlsx,
  getProjectHierarchyRows,
} from "@/lib/export";

/** The full Module→Requirement→Scenario→Test Group→Test Case tree, in the
 *  Import's own column order — round-trips straight back into that feature. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { id: projectId } = await context.params;
  const { forbidden } = await checkProjectRole(userId!, projectId, ALL_MEMBER_ROLES);
  if (forbidden) {
    return forbidden;
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = await getProjectHierarchyRows(projectId, project.code);

  if (format === "xlsx") {
    const buffer = await generateProjectHierarchyXlsx(rows);
    const fileName = `${project.code}-hierarchy.xlsx`;
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  }

  const fileName = `${project.code}-hierarchy.csv`;
  return new NextResponse(generateProjectHierarchyCsv(rows), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
