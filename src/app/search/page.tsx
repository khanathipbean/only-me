import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { searchAll } from "@/lib/search";
import { FilterForm } from "@/components/FilterForm";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass, mutedTextClass, pageClass } from "@/lib/ui";

const RESULT_TYPE_TONE: Record<string, Tone> = {
  Project: "purple",
  Scenario: "blue",
  TestGroup: "amber",
  TestCase: "green",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { q } = await searchParams;
  const results = q ? await searchAll(session.user.id, q) : [];

  return (
    <main className={pageClass}>
      <PageHeader title="Search" />

      <FilterForm action="/search" showClear={false}>
        <input
          type="search"
          name="q"
          placeholder="Search Projects, Scenarios, Test Groups, Test Cases"
          defaultValue={q}
          className={`${inputClass} max-w-lg`}
        />
      </FilterForm>

      {q && results.length === 0 && (
        <p className={mutedTextClass}>No results for &quot;{q}&quot;.</p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((result) => (
            <Card key={`${result.type}-${result.id}`} className="p-3">
              <Link
                href={result.href}
                className="font-medium text-foreground hover:text-brand hover:underline"
              >
                {result.label}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge tone={RESULT_TYPE_TONE[result.type] ?? "gray"}>{result.type}</Badge>
                <span>{result.projectName}</span>
                {result.position && <span>— {result.position}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
