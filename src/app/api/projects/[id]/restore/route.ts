import { NextResponse } from "next/server";
import { withCapability } from "@/lib/api-auth";
import { restoreProject } from "@/lib/projects";

export const POST = withCapability("project.edit", async (_request, { projectId, userId }) => {
  const project = await restoreProject(projectId, userId);
  return NextResponse.json(project);
});
