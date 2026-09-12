import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  DuplicateCodeError,
  ValidationError,
  createProject,
  listProjectsForUser,
} from "@/lib/projects";
import type { ProjectStatus } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { searchParams } = new URL(request.url);
  const projects = await listProjectsForUser(userId!, {
    search: searchParams.get("search") ?? undefined,
    status: (searchParams.get("status") as ProjectStatus | null) ?? undefined,
  });

  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const body = await request.json();

  try {
    const project = await createProject(
      {
        code: body.code,
        name: body.name,
        description: body.description,
        status: body.status,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
      },
      userId!,
    );

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateCodeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
