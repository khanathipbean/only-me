"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ projectId }: { projectId: string }) {
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
  const tabs = [
    { label: "Overview", href: overviewHref },
    { label: "Dashboard", href: `${overviewHref}/dashboard` },
    { label: "Modules", href: `${overviewHref}/modules` },
    { label: "Test Runs", href: `${overviewHref}/runs` },
    { label: "Files", href: `${overviewHref}/files` },
    { label: "Import", href: `${overviewHref}/import` },
    { label: "Audit Trail", href: `${overviewHref}/audit-log` },
  ];

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
