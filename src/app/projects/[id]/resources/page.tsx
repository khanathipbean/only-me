import Link from "next/link";
import { auth } from "@/auth";
import { can, requireCapabilityOrNotFound } from "@/lib/permissions";
import { getProjectById } from "@/lib/projects";
import { listModulesForProject } from "@/lib/modules";
import { listResourcesPage, type ResourceRow } from "@/lib/resources";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ResourceTabs } from "./ResourceTabs";
import { FilterForm } from "@/components/FilterForm";
import { ResultCount } from "@/components/ui/ResultCount";
import { resourcesBreadcrumb, nameOr } from "@/lib/breadcrumb";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowUpRightIcon,
  ClipboardListIcon,
  FileIcon,
  LinkIcon,
} from "@/components/icons";
import { inputClass, labelClass, mutedTextClass, pageClass } from "@/lib/ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  return { title: project ? `Resources · ${project.name}` : "Resources" };
}

/** How each kind is drawn. The colour is the only thing that tells two rows
 *  apart at a glance, so it is never the only thing: the label on the right
 *  says the same in words. */
const KIND_STYLE = {
  NOTE: {
    Icon: ClipboardListIcon,
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  FILE: {
    Icon: FileIcon,
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  LINK: {
    Icon: LinkIcon,
    className: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
} as const;

/**
 * Everything kept against this project, in one list.
 *
 * Read-only on purpose. A note is edited in a dialog with a body field, a
 * file is replaced by uploading another, a link is edited in a dialog with
 * an address — three sets of actions that have nothing in common. Carrying
 * all three here would make every row ask the reader which kind it is before
 * they could do anything, so a row goes to the tab that owns it instead.
 */
export default async function ResourcesPage({ params, searchParams }: PageProps<"/projects/[id]/resources">) {
  const { id: projectId } = await params;
  const { search, moduleId, archived, page, pageSize } = await searchParams;
  const session = await auth();

  const membership = await requireCapabilityOrNotFound(
    session!.user.id,
    projectId,
    "notes.view",
  );
  /* Separate capabilities still. Somebody may read notes and links without
     being allowed the files, and then this list must not show them — hiding
     the pill alone would leave the rows. */
  const canSeeFiles = await can(membership.role, "files.view");

  const showArchived = archived === "1";
  const hasFilters = Boolean(search || moduleId || showArchived);

  const [project, modules, result] = await Promise.all([
    getProjectById(projectId),
    listModulesForProject(projectId),
    listResourcesPage(projectId, {
      search: typeof search === "string" ? search : undefined,
      moduleId: typeof moduleId === "string" ? moduleId : undefined,
      archived: showArchived,
      includeFiles: canSeeFiles,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    }),
  ]);

  const moduleOptions = modules.map((row) => ({ value: row.id, label: row.name }));

  function Row({ row }: { row: ResourceRow }) {
    const { Icon, className } = KIND_STYLE[row.kind];
    /* A link leaves the app, so it opens in a new tab and carries
       `rel="noopener noreferrer"` — without it the page opened can reach
       back through `window.opener` and navigate the tab it came from, which
       is this app with this reader signed in. The other two stay here and
       use the client-side router. */
    const content = (
      <>
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg [&>svg]:size-5 ${className}`}
        >
          <Icon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate font-semibold text-foreground">{row.title}</span>
            {row.external && <ArrowUpRightIcon className="size-3.5 shrink-0 text-brand" />}
            {row.module && (
              <span className="shrink-0">
                <Badge tone="indigo">{row.module}</Badge>
              </span>
            )}
          </span>
          {row.detail && <span className="truncate text-sm text-muted">{row.detail}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-sm text-muted tabular-nums">{formatDate(row.on)}</span>
          {/* The kind in words beside the colour, so the three are told apart
              by something other than hue. */}
          <span className="text-[10px] font-semibold tracking-wider text-muted">{row.kind}</span>
        </span>
      </>
    );

    const rowClass =
      "flex min-h-16 items-center gap-3.5 border-b border-border px-5 py-3 last:border-b-0 hover:bg-black/[.03] dark:hover:bg-white/[.05]";

    return row.external ? (
      <a href={row.href} target="_blank" rel="noopener noreferrer" className={rowClass}>
        {content}
      </a>
    ) : (
      <Link href={row.href} className={rowClass}>
        {content}
      </Link>
    );
  }

  return (
    <main className={pageClass}>
      <Breadcrumb
        segments={resourcesBreadcrumb({ id: projectId, name: nameOr(project, projectId) })}
      />

      {/* Above the title and at the left edge: this control changes which
          page you are on, so it leads the page rather than trailing its
          name. On the breadcrumb line it sat far from the title it governs
          and wrapped under the crumbs on a narrow screen. */}
      <ResourceTabs projectId={projectId} active="all" canSeeFiles={canSeeFiles} />

      <PageHeader
        title="Resources"
        subtitle="Notes, files and links for this project, in one place."
      />


      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* No Feature filter here, and not by oversight: a file has no
            Feature column at all, so filtering by one would drop every file
            from a list that says it holds everything. The three tabs below
            offer it where it means something. */}
        <FilterForm showClear={hasFilters} className="flex-1">
          <input
            type="text"
            name="search"
            placeholder="Search notes, files and links"
            defaultValue={typeof search === "string" ? search : undefined}
            className={`${inputClass} max-w-xs`}
          />
          <label className={labelClass}>
            Module
            <Select
              name="moduleId"
              defaultValue={typeof moduleId === "string" ? moduleId : ""}
              options={[
                { value: "", label: "All modules" },
                { value: "none", label: "No module" },
                ...moduleOptions,
              ]}
              ariaLabel="Module"
              autoWidth
              className="max-w-52"
            />
          </label>
          <label className={labelClass}>
            Show
            <Select
              name="archived"
              defaultValue={typeof archived === "string" ? archived : ""}
              options={[
                { value: "", label: "Active" },
                { value: "1", label: "Archived" },
              ]}
              ariaLabel="Show"
              className="max-w-36"
            />
          </label>
        </FilterForm>
        <ResultCount total={result.total} />
      </div>

      {result.items.length === 0 ? (
        <p className={mutedTextClass}>
          {showArchived
            ? "Nothing archived here."
            : hasFilters
              ? "Nothing matches your search."
              : "Nothing yet. Write a note, upload a file, or paste the address of something that lives elsewhere."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {result.items.map((row) => (
            <Row key={`${row.kind}-${row.id}`} row={row} />
          ))}
        </div>
      )}

      <p className={mutedTextClass}>
        Sorted by the date each one is about — a note&rsquo;s own date, a file&rsquo;s upload, a
        link&rsquo;s. Newest first.
      </p>

      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        totalPages={result.totalPages}
      />
    </main>
  );
}
