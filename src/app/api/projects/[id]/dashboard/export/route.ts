import { NextResponse } from "next/server";
import { checkCapability, requireApiSession } from "@/lib/api-auth";
import { getProjectById } from "@/lib/projects";
import { getProjectDashboard } from "@/lib/dashboard";
import { generateDashboardSummaryCsv } from "@/lib/export";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { id: projectId } = await context.params;
  const { forbidden } = await checkCapability(userId!, projectId, "reading.dashboard");
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
