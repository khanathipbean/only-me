import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Tooltip } from "@/components/ui/Tooltip";
import { Badge, projectStatusTone } from "@/components/ui/Badge";
import { FILE_KIND_STYLE } from "@/components/fileKindStyle";
import { NOTIFICATION_TYPE_STYLE } from "@/components/notificationStyle";
import {
  BellIcon,
  BoxIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  PlayIcon,
  SettingsIcon,
  UploadIcon,
} from "@/components/icons";
import { formatTimestamp } from "@/lib/dates";
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

/**
 * The Overview tab's content once a Project actually has data — "what does
 * this Project have right now, and get me to recent work fast." Replaces
 * `ProjectQuickActions` (which stays for the genuinely empty case): that one
 * launches you into a first action, this one orients you inside an already-
 * moving Project. No "active sprint" or "visibility" panel — neither concept
 * exists in this app, unlike the reference design this was adapted from.
 */
export function ProjectOverviewSummary({
  project,
  summary,
  canEdit,
}: {
  project: Project;
  summary: Summary;
  /** Hides every link that would only 404 anyway — a VIEWER/QA_LEAD-less
   *  role can't reach the Edit dialog these point at (`EDITOR_ROLES`, same
   *  guard the Projects list's row actions now enforce server-side). */
  canEdit: boolean;
}) {
  const base = `/projects/${project.id}`;
  // Opens straight into editing this Project on the Projects list, rather
  // than dropping someone on the bare list to find the row themselves.
  const editHref = `/projects?edit=1&projectId=${project.id}`;

  const quickActions = [
    { label: "New module", href: `${base}/modules`, icon: <BoxIcon /> },
    { label: "Upload file", href: `${base}/files`, icon: <FolderIcon /> },
    { label: "Import from file", href: `${base}/import`, icon: <UploadIcon /> },
    { label: "Start a test run", href: `${base}/runs`, icon: <PlayIcon /> },
    ...(canEdit
      ? [{ label: "Project settings", href: editHref, icon: <SettingsIcon /> }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            {project.name}
            <span className="text-sm font-normal text-muted">({project.code})</span>
            <Badge tone={projectStatusTone(project.status)}>{project.status}</Badge>
          </h1>
          {project.description && (
            <Tooltip
              label={<span className="whitespace-pre-line">{project.description}</span>}
              className="mt-1 block"
            >
              <p className="line-clamp-1 cursor-default text-sm text-muted">
                {project.description}
              </p>
            </Tooltip>
          )}
        </div>
        {canEdit && (
          <Link
            href={editHref}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-black/[.03] dark:hover:bg-white/[.05]"
          >
            <SettingsIcon className="size-4" />
            Project settings
          </Link>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`${base}/modules`}>
          <Stat icon={<BoxIcon />} label="Modules" value={summary.counts.modules} />
        </Link>
        <Link href={`${base}/modules`}>
          <Stat icon={<FileTextIcon />} label="Requirements" value={summary.counts.requirements} />
        </Link>
        <Link href={`${base}/runs`}>
          <Stat icon={<PlayIcon />} label="Test Runs" value={summary.counts.testRuns} />
        </Link>
        <Link href={`${base}/files`}>
          <Stat icon={<FolderIcon />} label="Files" value={summary.counts.files} />
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel icon={<BoxIcon className="size-4 text-muted" />} title="Recent modules" viewAllHref={`${base}/modules`}>
          {summary.recentModules.length === 0 ? (
            <EmptyRow>No modules yet.</EmptyRow>
          ) : (
            summary.recentModules.map((module) => (
              <Link key={module.id} href={`${base}/modules/${module.id}/requirements`} className={rowClass}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{module.name}</span>
                  <span className="text-xs text-muted">{module.requirementCount} requirement(s)</span>
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

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="flex flex-col gap-1">
          <div className={panelHeaderClass}>
            <span className={panelTitleClass}>Project details</span>
            {canEdit && (
              <Link href={editHref} className={viewAllClass}>
                Edit details
                <ChevronRightIcon className="size-3" />
              </Link>
            )}
          </div>
          <dl className="flex flex-col gap-2 pt-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Owner</dt>
              <dd className="font-medium text-foreground">{project.owner.name}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Last updated</dt>
              <dd className="text-right font-medium text-foreground">
                {project.updatedBy?.name ?? "—"}
                <br />
                <span className="text-xs font-normal text-muted">
                  {formatTimestamp(project.updatedAt)}
                </span>
              </dd>
            </div>
          </dl>
        </Card>

        <Panel icon={<BellIcon className="size-4 text-muted" />} title="Recent activity" viewAllHref={`${base}/audit-log`}>
          {summary.recentActivity.length === 0 ? (
            <EmptyRow>Nothing has happened here yet.</EmptyRow>
          ) : (
            summary.recentActivity.map((item) => {
              const { Icon, className } = NOTIFICATION_TYPE_STYLE[item.type];
              return (
                <div key={item.id} className="flex items-start gap-2.5 px-2 py-2 text-sm">
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-full [&>svg]:size-5 ${className}`}>
                    <Icon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-foreground">{item.body}</span>
                    <span className="text-xs text-muted">{formatTimestamp(item.occurredAt)}</span>
                  </span>
                </div>
              );
            })
          )}
        </Panel>

        <Card className="flex flex-col gap-1">
          <span className={`${panelTitleClass} border-b border-border pb-3`}>Quick actions</span>
          <div className="flex flex-col pt-1">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href} className={rowClass}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand [&>svg]:size-5">
                  {action.icon}
                </span>
                <span className="flex-1 font-medium text-foreground">{action.label}</span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
