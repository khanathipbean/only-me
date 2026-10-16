import Link from "next/link";
import { pageClass } from "@/lib/ui";

export const metadata = { title: "Not found" };

/**
 * What `notFound()` renders. It is reached far more often than its name
 * suggests: `requireProjectRoleOrNotFound` calls it when somebody is not a
 * member of a Project, deliberately, so a stranger cannot tell an id that
 * does not exist from one they are not allowed to see.
 *
 * So the wording has to cover both without giving the second away — "either
 * it is not there or it is not yours" is the honest version of that, and
 * saying so is kinder than a bare 404 to the reader who simply followed an
 * old link.
 */
export default function NotFound() {
  return (
    <main className={`${pageClass} items-center justify-center py-24 text-center`}>
      <p className="font-mono text-sm tracking-widest text-muted">404</p>
      <h1 className="text-2xl font-semibold text-foreground">We couldn&apos;t find that</h1>
      <p className="max-w-md text-sm text-muted">
        The page may have been archived or deleted, the address may be mistyped, or it may belong
        to a Project you are not a member of.
      </p>
      <Link
        href="/projects"
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
      >
        Back to Projects
      </Link>
    </main>
  );
}
