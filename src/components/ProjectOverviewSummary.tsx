import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { Tooltip } from "@/components/ui/Tooltip";
import { Badge, projectStatusTone } from "@/components/ui/Badge";
import { isProjectOverdue, isTestRunOverdue } from "@/lib/deadlines";
import { FILE_KIND_STYLE } from "@/components/fileKindStyle";
import {
  BoxIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  LayersIcon,
  PlayIcon,
  TagIcon,
  UploadIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
} from "@/components/icons";
import { formatDate } from "@/lib/dates";
import type { getProjectById } from "@/lib/projects";
import type { getProjectOverviewSummary } from "@/lib/project-overview";

type Project = NonNullable<Awaited<ReturnType<typeof getProjectById>>>;
type Summary = Awaited<ReturnType<typeof getProjectOverviewSummary>>;

const panelHeaderClass =
  "flex items-center justify-between gap-2 border-b border-border pb-3";
const panelTitleClass = "flex items-center gap-2 text-sm font-semibold text-foreground";
const viewAllClass = "flex items-center gap-1 text-xs font-medium text-brand hover:underline";
const rowClass =
  "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-black/[.03] dark:hover:bg-white/[.05]";

function Panel({
  icon,
  title,
  viewAllHref,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  viewAllHref: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <div className={panelHeaderClass}>
        <span className={panelTitleClass}>
          {icon}
          {title}
        </span>
        <Link href={viewAllHref} className={viewAllClass}>
          View all
          <ChevronRightIcon className="size-3" />
        </Link>
      </div>
      <div className="flex flex-col pt-1">{children}</div>
    </Card>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-3 text-sm text-muted">{children}</p>;
}

const STAT_TONE = {
  indigo: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
  blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  green: "bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400",
  orange: "bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
  purple: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
} as const;

function StatTile({
  icon,
  label,
  value,
  tone,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: keyof typeof STAT_TONE;
  href: string;
}) {
  return (
    <Link href={href} className="flex">
      <Card className="flex w-full items-center gap-3.5 transition-colors hover:border-brand">
        <span
          className={`flex size-12 shrink-0 items-center justify-center rounded-lg [&>svg]:size-6 ${STAT_TONE[tone]}`}
        >
          {icon}
        </span>
        <span aria-hidden="true" className="h-10 w-px shrink-0 bg-border" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted">{label}</p>
          <p className="text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted" />
      </Card>
    </Link>
  );
}

/**
 * The Overview tab's content once a Project actually has data — "what does
 * this Project have right now, and get me to recent work fast." Replaces
 * `ProjectQuickActions` (which stays for the genuinely empty case): that one
 * launches you into a first action, this one orients you inside an already-
 * moving Project.
 */
export function ProjectOverviewSummary({
  project,
  summary,
}: {
  project: Project;
  summary: Summary;
}) {
  const base = `/projects/${project.id}`;

  const quickActions = [
    {
      label: "Create module",
      description: "Organize requirements",
      href: `${base}/modules`,
      icon: <LayersIcon />,
      tone: "indigo" as const,
    },
    {
      label: "Upload files",
      description: "Add project documents",
      href: `${base}/files`,
      icon: <FileTextIcon />,
      tone: "blue" as const,
    },
    {
      label: "Import test structure",
      description: "Import from a file",
      href: `${base}/import`,
      icon: <UploadIcon />,
      tone: "orange" as const,
    },
    {
      label: "Start test run",
      description: "Create and run tests",
      href: `${base}/runs`,
      icon: <PlayIcon />,
      tone: "green" as const,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400 [&>svg]:size-6">
            <BoxIcon />
          </span>
          {/* Name, code and description share this column's left edge, so the
              description lines up under the Project's name instead of the
              icon beside it. */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {project.name}
              </h1>
              <Badge tone={projectStatusTone(project.status)}>{project.status}</Badge>
              {isProjectOverdue(project) && <Badge tone="red">Overdue</Badge>}
            </div>
            <p className="text-sm text-muted">{project.code}</p>
            <div className="mt-3">
              {project.description ? (
                <ExpandableText text={project.description} />
              ) : (
                <p className="text-sm text-muted">No description yet.</p>
              )}
            </div>
          </div>
        </div>

        <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-4 border-t border-border pt-4 sm:grid-cols-4 lg:w-72 lg:grid-cols-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="size-4 shrink-0 text-muted" />
            <dt className="w-24 shrink-0 text-sm text-muted">Created</dt>
            <dd className="truncate text-sm font-medium text-foreground">
              {formatDate(project.createdAt)}
            </dd>
          </div>
          <div className="flex items-center gap-2.5">
            <UserIcon className="size-4 shrink-0 text-muted" />
            <dt className="w-24 shrink-0 text-sm text-muted">Created by</dt>
            <dd className="truncate text-sm font-medium text-foreground">
              {project.owner.name}
            </dd>
          </div>
          <div className="flex items-center gap-2.5">
            <UsersIcon className="size-4 shrink-0 text-muted" />
            <dt className="w-24 shrink-0 text-sm text-muted">Members</dt>
            <dd className="truncate text-sm font-medium text-foreground">
              {summary.counts.members} {summary.counts.members === 1 ? "member" : "members"}
            </dd>
          </div>
          <div className="flex items-center gap-2.5">
            <TagIcon className="size-4 shrink-0 text-muted" />
            <dt className="w-24 shrink-0 text-sm text-muted">Project code</dt>
            <dd className="truncate text-sm font-medium text-foreground">{project.code}</dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<LayersIcon />}
          label="Modules"
          value={summary.counts.modules}
          tone="indigo"
          href={`${base}/modules`}
        />
        {/* Notes where Requirements used to be. Every other tile is one
            tab: Modules, Test Runs, Files. Requirements is not a tab at all
            — it lives under a Module — and its link went to `/modules`, the
            same place the tile beside it already went, so the row had four
            tiles and three destinations. The count itself is still on the
            Dashboard, which is where a number about the size of the test
            structure belongs. */}
        <StatTile
          icon={<ClipboardListIcon />}
          label="Notes"
          value={summary.counts.notes}
          tone="purple"
          href={`${base}/notes`}
        />
        <StatTile
          icon={<PlayIcon />}
          label="Test Runs"
          value={summary.counts.testRuns}
          tone="green"
          href={`${base}/runs`}
        />
        <StatTile
          icon={<FolderIcon />}
          label="Files"
          value={summary.counts.files}
          tone="orange"
          href={`${base}/files`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* Notes, where Modules used to be. A project's Modules are drawn
            once and then sit still, so "recent" among them meant the same
            five names for months; a Note is written whenever something is
            decided. Modules keep their stat tile above, which is the link
            into them. */}
        <Panel
          icon={<ClipboardListIcon className="size-4 text-muted" />}
          title="Recent notes"
          viewAllHref={`${base}/notes`}
        >
          {summary.recentNotes.length === 0 ? (
            <EmptyRow>No notes yet.</EmptyRow>
          ) : (
            summary.recentNotes.map((note) => (
              /* Straight to the Notes page with this row already open —
                 `noteId` is what the list reads to decide which one starts
                 expanded. Opening the body here instead would mean shipping
                 every body to a page that mostly does not show them. */
              <Link key={note.id} href={`${base}/notes?noteId=${note.id}`} className={rowClass}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 [&>svg]:size-5">
                  <ClipboardListIcon />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {/* The panel is a third of the page wide and the tag
                        takes part of that, so a title of any length is cut.
                        The tooltip is where the rest of it lives. */}
                    <Tooltip label={note.title} className="flex min-w-0">
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {note.title}
                      </span>
                    </Tooltip>
                    {note.feature && (
                      <span className="shrink-0">
                        <Badge tone="gray" variant="outline">
                          {note.feature}
                        </Badge>
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted">
                    {note.module} · {formatDate(note.on)}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted" />
              </Link>
            ))
          )}
        </Panel>

        <Panel icon={<PlayIcon className="size-4 text-muted" />} title="Latest test runs" viewAllHref={`${base}/runs`}>
          {summary.recentRuns.length === 0 ? (
            <EmptyRow>No test runs yet.</EmptyRow>
          ) : (
            summary.recentRuns.map((run) => (
              <Link key={run.id} href={`${base}/runs/${run.id}`} className={rowClass}>
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full [&>svg]:size-5 ${
                    run.status === "CLOSED"
                      ? "bg-green-500/10 text-green-600 dark:text-green-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {run.status === "CLOSED" ? <CheckIcon /> : <ClockIcon />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground">{run.name}</span>
                    {run.phase && <Badge tone="gray">{run.phase}</Badge>}
                    {isTestRunOverdue(run) && <Badge tone="red">Overdue</Badge>}
                  </span>
                  <span className="text-xs text-muted">
                    {run.status === "CLOSED" ? "Completed" : "Open"} · {run.percent}% passed
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted" />
              </Link>
            ))
          )}
        </Panel>

        <Panel icon={<FolderIcon className="size-4 text-muted" />} title="Recent files" viewAllHref={`${base}/files`}>
          {summary.recentFiles.length === 0 ? (
            <EmptyRow>No files yet.</EmptyRow>
          ) : (
            summary.recentFiles.map((file) => {
              const { Icon, className } = FILE_KIND_STYLE[file.kind];
              return (
                <Link key={file.id} href={`${base}/files?fileId=${file.id}`} className={rowClass}>
                  {/* Bigger than the other rows' plain icons on purpose: this
                      one draws a "PDF"/"CSV"-style label inside itself, which
                      needs more room to stay legible than a bare glyph does. */}
                  <span className={`flex size-12 shrink-0 items-center justify-center rounded-md [&>svg]:size-7 ${className}`}>
                    <Icon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{file.fileName}</span>
                    <span className="text-xs text-muted">{file.module}</span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted" />
                </Link>
              );
            })
          )}
        </Panel>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={panelTitleClass}>
            <ZapIcon className="size-4 text-muted" />
            Quick actions
          </span>
          <span className="text-xs text-muted">Get started with common project tasks</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:border-brand hover:bg-black/[.02] dark:hover:bg-white/[.03]"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4 ${STAT_TONE[action.tone]}`}
              >
                {action.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {action.label}
                </span>
                <span className="block truncate text-xs text-muted">{action.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
