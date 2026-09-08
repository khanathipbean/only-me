import { NextResponse } from "next/server";
import { withProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES } from "@/lib/rbac";
import { listAuditLogForProject, parseUtcDateTimeLocal } from "@/lib/audit-log";

export const GET = withProjectRole(ALL_MEMBER_ROLES, async (request, { projectId }) => {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");

  const result = await listAuditLogForProject(projectId, {
    actorId: searchParams.get("actorId") ?? undefined,
    action: searchParams.get("action") ?? undefined,
    entityType: searchParams.get("entityType") ?? undefined,
    from: parseUtcDateTimeLocal(searchParams.get("from")),
    to: parseUtcDateTimeLocal(searchParams.get("to")),
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });

  return NextResponse.json(result);
});
