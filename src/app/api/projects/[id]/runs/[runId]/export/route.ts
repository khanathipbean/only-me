import { NextResponse } from "next/server";
import { checkProjectRole, requireApiSession } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES } from "@/lib/rbac";
import { getRunById, listRunResultsForExport } from "@/lib/test-runs";
import { generateRunResultsCsv } from "@/lib/export";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { id: projectId, runId } = await context.params;
  const { forbidden } = await checkProjectRole(userId!, projectId, ALL_MEMBER_ROLES);
  if (forbidden) {
    return forbidden;
  }

  const run = await getRunById(runId);
  if (!run || run.projectId !== projectId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cases = await listRunResultsForExport(runId);
  const fileName = `${run.name}-results.csv`;
  return new NextResponse(generateRunResultsCsv(cases), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
