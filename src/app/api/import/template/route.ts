import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { generateImportTemplateCsv } from "@/lib/import/parse";

export async function GET() {
  const { unauthorized } = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  return new NextResponse(generateImportTemplateCsv(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="import-template.csv"',
    },
  });
}
