import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { searchAll } from "@/lib/search";

export async function GET(request: NextRequest) {
  const { userId, unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { searchParams } = new URL(request.url);
  const results = await searchAll(userId!, searchParams.get("q") ?? "");

  return NextResponse.json({ results });
}
