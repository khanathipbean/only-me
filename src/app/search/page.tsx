import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { searchAll } from "@/lib/search";

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
    <main>
      <h1>Search</h1>
      <form action="/search" method="get" role="search">
        <input
          type="search"
          name="q"
          placeholder="Search Projects, Scenarios, Test Groups, Test Cases"
          defaultValue={q}
        />
        <button type="submit">Search</button>
      </form>

      {q && results.length === 0 && <p>No results for &quot;{q}&quot;.</p>}

      {results.length > 0 && (
        <ul>
          {results.map((result) => (
            <li key={`${result.type}-${result.id}`}>
              <Link href={result.href}>{result.label}</Link>{" "}
              <small>
                {result.type} — {result.projectName}
                {result.position ? ` — ${result.position}` : ""}
              </small>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
