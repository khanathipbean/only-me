"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CapabilityKey } from "@/lib/permissions";

/**
 * `allowed` decides which tabs exist, because a DEV may open five of these
 * ten and would otherwise be shown four links to a 404.
 *
 * Capability names rather than the role itself: this is a client component,
 * and the rules live in `@/lib/rbac` beside functions that open a database
 * connection — importing them here pulled `pg` into the browser bundle and
 * the build stopped at "Can't resolve 'dns'". `CapabilityKey` is a type, so
 * it is erased at build time and carries nothing with it; the layout holds
 * the role and works the answers out.
 *
 * Each tab names the capability its own page checks, so the two cannot
 * disagree. They did: Import was shown to anybody who was not a DEV while
 * the page asked for an editor, so a VIEWER was offered a link to a 404.
 *
 * Hiding is not the guard. Every page below checks the role itself — hiding
 * a link a URL still reaches is the hole `/projects/new` once had, where the
 * button was gone and typing the address worked. This is so the menu tells
 * the truth, not so the pages are safe.
 */
export function ProjectTabs({
  projectId,
  allowed,
}: {
  projectId: string;
  allowed: readonly CapabilityKey[];
}) {
  const pathname = usePathname();
  const overviewHref = `/projects/${projectId}`;

  /*
   * Three groups, left to right: read, work, reach for.
   *
   * Overview and Dashboard are both places you go to look at numbers and
   * change nothing, and they used to sit either side of the two pages you
   * actually work in. Modules and Test Runs are the work — authoring the
   * tests and running them. Files, Import and Audit Trail are occasional:
   * Audit Trail last of all, since it is opened to settle a question about
   * who changed what rather than to get anything done.
   *
   * The order before this was not designed — Dashboard, Files and Import
   * arrived together in one commit and Test Runs was slotted in later, so
   * nothing had ever placed the seven against each other.
   */
  const everyTab: { label: string; href: string; needs: CapabilityKey }[] = [
    { label: "Overview", href: overviewHref, needs: "reading.overview" },
    /* After Overview, and first for a DEV — who has no Overview, so the
     * filter above leaves this at the front for them without the order
     * having to know about roles. Where a DEV lands and what they came for;
     * for everybody else, the part of the project's work that is in their
     * hands, which is worth a link even when it is usually empty. */
    { label: "My Work", href: `${overviewHref}/my-work`, needs: "handoff.view" },
    { label: "Dashboard", href: `${overviewHref}/dashboard`, needs: "reading.dashboard" },
    /* With Dashboard rather than with the work: both are places you go to
       look at what the numbers say and change nothing. Dashboard answers how
       far along a round is; this one answers which cases keep going wrong. */
    { label: "Problem Cases", href: `${overviewHref}/problem-cases`, needs: "reading.problems" },
    { label: "Modules", href: `${overviewHref}/modules`, needs: "authoring.view" },
    { label: "Test Runs", href: `${overviewHref}/runs`, needs: "runs.view" },
    { label: "Notes", href: `${overviewHref}/notes`, needs: "notes.view" },
    { label: "Files", href: `${overviewHref}/files`, needs: "files.view" },
    /* Import writes, so an editor is what the page asks for — the link is
     * dropped here only so the menu does not offer what it will refuse. */
    { label: "Import", href: `${overviewHref}/import`, needs: "project.import" },
    { label: "Audit Trail", href: `${overviewHref}/audit-log`, needs: "project.audit" },
  ];

  /* Only the ones this membership can open — a link to a 404 is worse than
     no link at all. */
  const tabs = everyTab.filter((tab) => allowed.includes(tab.needs));

  return (
    <nav aria-label="Project" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive =
          tab.href === overviewHref ? pathname === overviewHref : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
