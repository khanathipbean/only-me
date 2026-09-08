import { NextResponse } from "next/server";
import { withProjectRole } from "@/lib/api-auth";
import { ALL_MEMBER_ROLES, EDITOR_ROLES } from "@/lib/rbac";
import {
  DuplicateCodeError,
  ValidationError,
  getProjectById,
  updateProject,
} from "@/lib/projects";

export const GET = withProjectRole(ALL_MEMBER_ROLES, async (_request, { projectId }) => {
  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
});

export const PATCH = withProjectRole(EDITOR_ROLES, async (request, { projectId, userId }) => {
  const body = await request.json();

  try {
    const project = await updateProject(
      projectId,
      {
        code: body.code,
        name: body.name,
        description: body.description,
        status: body.status,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
      userId,
    );

    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateCodeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
});
