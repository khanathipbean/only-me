"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const overviewHref = `/projects/${projectId}`;

  const tabs = [
    { label: "Overview", href: overviewHref },
    { label: "Modules", href: `${overviewHref}/modules` },
    { label: "Dashboard", href: `${overviewHref}/dashboard` },
    { label: "Audit Trail", href: `${overviewHref}/audit-log` },
    { label: "Files", href: `${overviewHref}/files` },
    { label: "Import", href: `${overviewHref}/import` },
  ];

  return (
    <nav aria-label="Project" className="flex gap-1 overflow-x-auto">
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
