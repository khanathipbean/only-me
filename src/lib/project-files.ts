import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MAX_UPLOAD_BYTES, downloadFile, uploadFile } from "@/lib/storage";
import { notifyProject } from "@/lib/notifications";

const FOLDER = "project-files";

export const MAX_FILE_BYTES = MAX_UPLOAD_BYTES;

/**
 * Types the browser can display without being able to run anything.
 *
 * Anything outside this list is served as a download. SVG is deliberately
 * absent: it is an XML document that can carry script, so rendering one
 * inline would run that script on this app's own origin, with access to the
 * session cookie.
 */
const INLINE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function canPreview(contentType: string) {
  return INLINE_TYPES.has(contentType);
}

export type FileKind =
  | "pdf"
  | "word"
  | "excel"
  | "csv"
  | "image"
  | "text"
  | "video"
  | "audio"
  | "generic";

const WORD_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const EXCEL_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/* Extensions that hold text, whatever the browser called them on upload —
 * `application/json` and `application/octet-stream` are both common for these
 * and neither starts with `text/`. */
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "log", "yml", "yaml", "xml"]);

/**
 * Which icon a file's card should show. Content type comes first, but
 * browsers are inconsistent about what they report for office documents
 * (`application/octet-stream` is common), so the file name's extension is
 * the fallback rather than a second source of truth.
 */
export function getFileKind(contentType: string, fileName: string): FileKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "text/csv" || contentType === "text/tab-separated-values") return "csv";
  if (EXCEL_TYPES.has(contentType)) return "excel";
  if (WORD_TYPES.has(contentType)) return "word";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";

  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "csv":
    case "tsv":
      return "csv";
    case "xls":
    case "xlsx":
      return "excel";
    case "doc":
    case "docx":
      return "word";
    case "mp4":
    case "webm":
    case "mov":
      return "video";
    case "mp3":
    case "wav":
    case "ogg":
    case "m4a":
      return "audio";
  }

  /* Checked after the extensions above so a `.csv` the browser labelled
   * `text/plain` still reads as a table rather than as its own source. */
  if (contentType.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) {
    return "text";
  }
  return "generic";
}

/**
 * How the preview dialog should draw a file — a different question from
 * `canPreview`, which decides what the *server* is willing to send with an
 * inline Content-Disposition.
 *
 * The two used to be the same answer because the only previews were an
 * `<img>` and an `<iframe>`, both of which make the browser interpret bytes
 * this app served. Text and tables don't: the dialog reads the blob it has
 * already fetched and puts characters in the DOM. So these render without
 * anything being added to `INLINE_TYPES`, and the files still download rather
 * than open in a tab — which is the safer half of the arrangement, not a
 * limitation to work around.
 *
 * Markdown is `text`, never rendered HTML. Turning it into markup would be
 * the same hole `INLINE_TYPES` keeps SVG out for, reached from a different
 * direction.
 */
export type PreviewMode = "image" | "frame" | "text" | "table" | "video" | "audio" | "none";

export function previewMode(contentType: string, fileName: string): PreviewMode {
  const kind = getFileKind(contentType, fileName);
  if (kind === "csv") return "table";
  if (kind === "text") return "text";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  /* Image and PDF still go through the server's own list: these two are drawn
   * by the browser from bytes we serve, so what it is willing to serve inline
   * is exactly the right gate. */
  if (!canPreview(contentType)) return "none";
  return kind === "image" ? "image" : "frame";
}

export class FileValidationError extends Error {}

/** The heading files with no Module are listed under, and the label the
 *  filter offers for them. One constant so the two can't drift. */
export const NO_MODULE_HEADING = "No module";

export async function saveProjectFile(
  projectId: string,
  moduleId: string | null,
  file: File,
  uploadedById: string,
) {
  /* A Module is optional, the way it is on a Note: a terms-of-reference
   * document or a contract belongs to the Project, not to one part of it, and
   * requiring an answer only had people file it under whichever Module was
   * nearest — which reads as deliberate and makes the Module filter lie.
   *
   * What is not optional is that a Module given must be this Project's: the
   * id comes from a form, and without the check a member of one Project could
   * file against another's Module.
   *
   * Not named `module`: that identifier is reserved in a CommonJS scope and
   * the Next lint rule rejects assigning to it. */
  const target = moduleId
    ? await prisma.module.findFirst({ where: { id: moduleId, projectId, deletedAt: null } })
    : null;
  if (moduleId && !target) {
    throw new FileValidationError("That Module is not part of this project");
  }
  if (file.size === 0) {
    throw new FileValidationError("That file is empty");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new FileValidationError(
      `File is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`,
    );
  }

  // The key is a bare UUID — the uploader's filename never reaches storage,
  // so a name like "../../etc/passwd" can't steer where the bytes land.
  const storageKey = `${FOLDER}/${randomUUID()}`;
  await uploadFile(
    storageKey,
    Buffer.from(await file.arrayBuffer()),
    file.type || "application/octet-stream",
  );

  const created = await prisma.projectFile.create({
    data: {
      projectId,
      moduleId: target?.id ?? null,
      // The text column stays written until phase 2 drops it, so a rollback
      // doesn't leave files with no heading at all. It is NOT NULL, so a file
      // with no Module gets the heading it is listed under rather than "".
      module: target?.name ?? NO_MODULE_HEADING,
      fileName: file.name,
      storageKey,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      uploadedById,
    },
  });

  await notifyProject({
    projectId,
    type: "FILE_UPLOADED",
    title: target ? `New file uploaded to ${target.name}` : "New file uploaded",
    body: target
      ? `${file.name} was uploaded to the ${target.name} module.`
      : `${file.name} was uploaded to the project.`,
    link: `/projects/${projectId}/files`,
    actorId: uploadedById,
    excludeUserId: uploadedById,
  });

  return created;
}

export type ProjectFileFilters = { search?: string; moduleId?: string };

/** Every live file in the project, grouped under its module heading. */
export async function listProjectFilesByModule(
  projectId: string,
  filters: ProjectFileFilters = {},
) {
  const files = await prisma.projectFile.findMany({
    where: {
      projectId,
      deletedAt: null,
      /* `none` is the filter for files about the Project itself. An empty
       * value already means "don't filter", so the two need different ones. */
      ...(filters.moduleId === "none"
        ? { moduleId: null }
        : filters.moduleId
          ? { moduleId: filters.moduleId }
          : {}),
      ...(filters.search
        ? { fileName: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: [{ module: "asc" }, { uploadedAt: "desc" }],
  });

  /* Keyed on the Module's id, not on the heading text: a Project is free to
   * have a Module actually named "No module", and grouping by name would
   * pour its files in with the ones that have none. */
  const groups = new Map<string, { module: string; files: typeof files }>();
  for (const file of files) {
    const key = file.moduleId ?? "";
    const group = groups.get(key);
    if (group) {
      group.files.push(file);
    } else {
      groups.set(key, {
        module: file.moduleId ? file.module : NO_MODULE_HEADING,
        files: [file],
      });
    }
  }

  /* Real Modules first, whatever they are called. The ones belonging to no
   * Module are the exception on the page and read better as a footnote than
   * sorted into the middle of the list by their heading's spelling. */
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : 0))
    .map(([, group]) => group);
}

export async function getProjectFile(id: string) {
  return prisma.projectFile.findFirst({ where: { id, deletedAt: null } });
}

/** Reads the bytes back. Resolves through the stored key only. */
export async function readProjectFileBytes(storageKey: string) {
  return downloadFile(storageKey);
}

/** Soft delete, matching every other level of the app — the bytes stay in
 * storage so an accidental removal is recoverable. */
export async function deleteProjectFile(id: string) {
  return prisma.projectFile.update({ where: { id }, data: { deletedAt: new Date() } });
}
