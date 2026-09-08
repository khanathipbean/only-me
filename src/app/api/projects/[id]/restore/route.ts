import { NextResponse } from "next/server";
import { withProjectRole } from "@/lib/api-auth";
import { EDITOR_ROLES } from "@/lib/rbac";
import { restoreProject } from "@/lib/projects";

export const POST = withProjectRole(EDITOR_ROLES, async (_request, { projectId, userId }) => {
  const project = await restoreProject(projectId, userId);
  return NextResponse.json(project);
});
