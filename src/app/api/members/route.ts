import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { isAdminAnywhere } from "@/lib/rbac";
import {
  DuplicateEmailError,
  ValidationError,
  createUserWithAccess,
  listAllMembers,
} from "@/lib/members";

export async function GET(request: Request) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }
  if (!(await isAdminAnywhere(userId!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const members = await listAllMembers({ projectId: searchParams.get("projectId") ?? undefined });
  return NextResponse.json(members);
}

export async function POST(request: Request) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }
  if (!(await isAdminAnywhere(userId!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  try {
    const member = await createUserWithAccess(
      body.access ?? [],
      {
        email: body.email,
        name: body.name,
        password: body.password,
      },
      userId!,
    );
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof DuplicateEmailError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
