import { NextResponse } from "next/server";
import { ChoiceError, PROJECT_STATUS_VALUES, readChoice } from "@/lib/enums";
import { withCapability } from "@/lib/api-auth";
import {
  DuplicateCodeError,
  ValidationError,
  getProjectById,
  updateProject,
} from "@/lib/projects";

export const GET = withCapability("project.read", async (_request, { projectId }) => {
  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
});

export const PATCH = withCapability("project.edit", async (request, { projectId, userId }) => {
  const body = await request.json();

  try {
    const project = await updateProject(
      projectId,
      {
        code: body.code,
        name: body.name,
        description: body.description,
        status: readChoice(body.status, PROJECT_STATUS_VALUES, "Status"),
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
      userId,
    );

    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof ChoiceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateCodeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
});
