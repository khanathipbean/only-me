// @embedded-postgres/windows-x64 is a Windows-only optional dependency —
// npm skips installing it on every other platform, so `tsc` has no type
// info for it there. This stub lets the dynamic import in
// embedded-postgres-windows.ts type-check everywhere; the module is only
// ever actually resolved (and only ever runs) on Windows.
declare module "@embedded-postgres/windows-x64" {
  export const pg_ctl: string;
}
