import { prisma } from "@/lib/prisma";
import { paginate, type PageFilters } from "@/lib/pagination";
import { formatSize } from "@/lib/file-size";
import { getFileKind } from "@/lib/project-files";

export type ResourceKind = "NOTE" | "FILE" | "LINK";

/**
 * One row of the All view, whatever it started as.
 *
 * Three tables with three shapes have to read as one list, so the shared
 * fields are the ones a reader actually scans: what it is called, one line
 * saying what it is, which Module it belongs to, and when. Everything that
 * only one kind has — a body, a size, an address — is flattened into
 * `detail` by whoever knows how to say it, rather than leaking three
 * optional columns into a type the page would then have to branch on.
 */
export type ResourceRow = {
  id: string;
  kind: ResourceKind;
  title: string;
  /** The one line under the title. Empty when that kind has nothing to add. */
  detail: string;
  /** Where the row goes. For a link this is somebody else's address. */
  href: string;
  /** True only for a link, which leaves this app. */
  external: boolean;
  module: string | null;
  /** What the row is sorted and dated by — see `dateOf` below. */
  on: Date;
};

export type ResourceFilters = {
  search?: string;
  /** A Module id, or "none" for the things filed against the Project. */
  moduleId?: string;
  archived?: boolean;
};

/**
 * The date each kind is about.
 *
 * A Note carries `occurredOn`, the day the thing it describes happened,
 * which is not the day it was typed — a Monday meeting written up on
 * Wednesday belongs under Monday, and the Notes list already orders itself
 * that way. A file and a link have no such day: the only honest date is when
 * they arrived. Sorting the merged list on anything else would quietly
 * reorder the notes against the list they came from.
 */
function noteDate(note: { occurredOn: Date | null; createdAt: Date }) {
  return note.occurredOn ?? note.createdAt;
}

/** The first line of a note's body, which is where people put the point. */
function firstLine(body: string) {
  const line = body.split("\n", 1)[0]?.trim() ?? "";
  return line;
}

/**
 * Everything on this page of Resources, newest first.
 *
 * `includeFiles` rather than a capability check in here: this module reads
 * the database and knows nothing about who is asking. The page above holds
 * the membership and answers `files.view` — and the Files page keeps its own
 * check, so a reader who is refused here is refused there too.
 *
 * The three queries are merged in memory, because no single statement spans
 * three tables with three different date columns and one page size. At this
 * size that costs nothing — hundreds of rows, read once per page view. It
 * would stop being free somewhere in the tens of thousands, and the answer
 * then is a view or a table that records the three as one, not a cleverer
 * query here.
 */
export async function listResourcesPage(
  projectId: string,
  {
    includeFiles,
    ...filters
  }: ResourceFilters & PageFilters & { includeFiles: boolean },
) {
  const search = filters.search?.trim() ?? "";
  const textMatch = { contains: search, mode: "insensitive" as const };
  const deletedAt = filters.archived ? { not: null } : null;

  /* `none` is the filter for the things filed against the Project itself. An
     empty value already means "don't filter", so the two need different
     words — the same convention the three lists below it use. */
  const moduleWhere =
    filters.moduleId === "none"
      ? { moduleId: null }
      : filters.moduleId
        ? { moduleId: filters.moduleId }
        : {};

  const withModule = { module: { select: { name: true } } } as const;

  const [notes, links, files] = await Promise.all([
    prisma.note.findMany({
      where: {
        projectId,
        deletedAt,
        ...moduleWhere,
        ...(search ? { OR: [{ title: textMatch }, { body: textMatch }] } : {}),
      },
      include: withModule,
    }),
    prisma.link.findMany({
      where: {
        projectId,
        deletedAt,
        ...moduleWhere,
        ...(search ? { OR: [{ title: textMatch }, { url: textMatch }] } : {}),
      },
      include: withModule,
    }),
    includeFiles
      ? prisma.projectFile.findMany({
          where: {
            projectId,
            deletedAt,
            ...moduleWhere,
            ...(search ? { fileName: textMatch } : {}),
          },
          include: { moduleRef: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const base = `/projects/${projectId}/resources`;

  const rows: ResourceRow[] = [
    ...notes.map((note) => ({
      id: note.id,
      kind: "NOTE" as const,
      title: note.title,
      detail: firstLine(note.body),
      /* Straight to the Notes tab with this row already open, which is what
         `noteId` does there — the body is not shipped to this list. */
      href: `${base}/notes?noteId=${note.id}`,
      external: false,
      module: note.module?.name ?? null,
      on: noteDate(note),
    })),
    ...links.map((link) => ({
      id: link.id,
      kind: "LINK" as const,
      title: link.title,
      /* The address itself: it is the whole content of a link, and a reader
         decides whether to follow it from what it says. */
      detail: link.url,
      href: link.url,
      external: true,
      module: link.module?.name ?? null,
      on: link.createdAt,
    })),
    ...files.map((file) => ({
      id: file.id,
      kind: "FILE" as const,
      title: file.fileName,
      detail: `${formatSize(file.size)} · ${getFileKind(file.contentType, file.fileName)}`,
      href: `${base}/files?fileId=${file.id}`,
      external: false,
      module: file.moduleRef?.name ?? null,
      on: file.uploadedAt,
    })),
  ].sort((a, b) => b.on.getTime() - a.on.getTime());

  /* Through `paginate` rather than slicing by hand, so the All view clamps a
     stale `?page=` the same way every other list does. */
  return paginate(
    filters,
    async () => rows.length,
    async ({ skip, take }) => rows.slice(skip, skip + take),
  );
}
