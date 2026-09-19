import { NextResponse } from "next/server";
import { checkProjectRole, requireApiSession } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES } from "@/lib/rbac";
import { getProjectById } from "@/lib/projects";
import { getProjectDashboard } from "@/lib/dashboard";
import { generateDashboardSummaryCsv } from "@/lib/export";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
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

  const dashboard = await getProjectDashboard(projectId);
  const fileName = `${project.code}-dashboard-summary.csv`;
  return new NextResponse(generateDashboardSummaryCsv(dashboard, project.name), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
