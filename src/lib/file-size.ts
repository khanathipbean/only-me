/**
 * A file's size in the shortest honest unit.
 *
 * In a file of its own, importing nothing, because both sides of the app
 * need it: `FilePreview` is a client component and the All view is a server
 * one. Keeping it next to the other file helpers looked tidier and was
 * wrong — `@/lib/project-files` reaches Prisma and `node:fs`, and a client
 * component importing a *value* from there drags all of it into the browser
 * bundle. (It had been importing only types from that module, which are
 * erased at build time, so nothing showed until the first real import:
 * Turbopack then panicked on `node:module` and the Files page stopped
 * compiling at all.)
 */
export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
