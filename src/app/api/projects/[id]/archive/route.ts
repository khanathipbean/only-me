import { NextResponse } from "next/server";
import { withCapability } from "@/lib/api-auth";
import { archiveProject } from "@/lib/projects";

export const POST = withCapability("project.edit", async (_request, { projectId, userId }) => {
  const project = await archiveProject(projectId, userId);
  return NextResponse.json(project);
});
