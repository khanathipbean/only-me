import { NextResponse } from "next/server";
import { withCapability } from "@/lib/api-auth";
import { listAuditLogForProject, parseUtcDateTimeLocal } from "@/lib/audit-log";

export const GET = withCapability("project.audit", async (request, { projectId }) => {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");

  const result = await listAuditLogForProject(projectId, {
    actorId: searchParams.get("actorId") ?? undefined,
    actorName: searchParams.get("actorName") ?? undefined,
    action: searchParams.get("action") ?? undefined,
    entityType: searchParams.get("entityType") ?? undefined,
    from: parseUtcDateTimeLocal(searchParams.get("from")),
    to: parseUtcDateTimeLocal(searchParams.get("to")),
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });

  return NextResponse.json(result);
});
