"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChartIcon,
  ClipboardListIcon,
  FolderIcon,
  HomeIcon,
  LayersIcon,
  PlayIcon,
  UploadIcon,
} from "@/components/icons";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const overviewHref = `/projects/${projectId}`;

  /* An icon each, because seven same-looking words is a list to read rather
     than a bar to aim at. They stay beside the label, never instead of it:
     nothing here has a shape everyone already knows. */
  const tabs = [
    { label: "Overview", href: overviewHref, icon: <HomeIcon /> },
    { label: "Modules", href: `${overviewHref}/modules`, icon: <LayersIcon /> },
    { label: "Test Runs", href: `${overviewHref}/runs`, icon: <PlayIcon /> },
    { label: "Dashboard", href: `${overviewHref}/dashboard`, icon: <BarChartIcon /> },
    { label: "Audit Trail", href: `${overviewHref}/audit-log`, icon: <ClipboardListIcon /> },
    { label: "Files", href: `${overviewHref}/files`, icon: <FolderIcon /> },
    { label: "Import", href: `${overviewHref}/import`, icon: <UploadIcon /> },
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
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <span className="shrink-0">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
