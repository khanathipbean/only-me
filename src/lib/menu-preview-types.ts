/**
 * What a nav menu shows beside its list of pages.
 *
 * In a file of its own, importing nothing, because both sides of the app read
 * it: `getMenuPreview` fills it on the server against Prisma, and the drawings
 * that render it are client components. A client component importing a *value*
 * from a module that reaches Prisma drags the database into the browser bundle
 * — that is the Turbopack panic `file-size.ts` was carved out to stop — and a
 * shared file with no imports cannot do it.
 *
 * Every date and size is already a string here. The payload crosses the wire
 * as JSON, where a `Date` arrives as text anyway, and formatting it on the
 * server keeps one answer rather than two that drift.
 */

/** A section is absent when the reader does not hold the capability for it.
 *  Absent is not empty: empty is a project with nothing in it yet. */
export type MenuPreview = {
  summary?: SummaryPreview;
  /** The same shape as the Summary, and deliberately so: both answer "what
   *  is in this project", and the two menus would otherwise disagree about
   *  the same figures. They are separate sections because they are separate
   *  permissions — a DEV may author test cases and may not read the
   *  Overview. */
  testCases?: SummaryPreview;
  testRuns?: TestRunsPreview;
  plans?: TestPlansPreview;
  dashboard?: DashboardPreview;
  problems?: ProblemsPreview;
  audit?: AuditPreview;
  notes?: NotesPreview;
  files?: FilesPreview;
  links?: LinksPreview;
};

/** The project's shape: one bar split by module, in proportion to the test
 *  cases each holds. */
export type SummaryPreview = {
  modules: { id: string; name: string; testCases: number; share: number }[];
  /** Modules past the three drawn, folded into one so the bar still totals
   *  the project. */
  otherModules: number;
  requirements: number;
  scenarios: number;
  testGroups: number;
  testCases: number;
};

export type DashboardPreview = {
  testCases: number;
  /** Cases with a verdict, over the total — the same number the Dashboard
   *  page calls Test Progress. */
  progress: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  notRun: number;
  /** How many modules the failures are spread over, which is the line a
   *  reader acts on. */
  failedModules: number;
  /** The round in progress, or the last one there was. Null before anybody
   *  has opened one. */
  latestRun: { name: string; answered: number; total: number } | null;
};

export type ProblemsPreview = {
  total: number;
  /** Largest first, each with its share of the largest, so the bars are read
   *  against each other. */
  patterns: { key: string; label: string; count: number; share: number }[];
  /** The cases that have failed most, which is what a reader opens this page
   *  to find. */
  worst: { id: string; name: string; failures: number }[];
};

export type AuditPreview = {
  /** Seven days, oldest first; the last is today. */
  week: { day: string; count: number; share: number }[];
  total: number;
  recent: { id: string; initials: string; what: string; when: string }[];
};

export type TestPlansPreview = {
  total: number;
  /** How many are in each state, in the order the page lists them. */
  byStatus: { status: string; label: string; count: number }[];
  /** The ones somebody is likely to be in the middle of, newest first. */
  recent: { id: string; name: string; phase: string; status: string; progress: number }[];
};

export type TestRunsPreview = {
  total: number;
  /** Newest first: the round somebody wants is almost always the one they
   *  just opened. */
  recent: {
    id: string;
    name: string;
    open: boolean;
    cases: number;
    /** Cases with a result recorded, which is what the bar fills to. */
    recorded: number;
    passed: number;
    failed: number;
  }[];
};

export type NotesPreview = {
  total: number;
  recent: { id: string; title: string; line: string; on: string }[];
};

export type FilesPreview = {
  total: number;
  size: string;
  /** Shares of the bytes, not of the count, so the bar and the heading are
   *  the same measure. */
  kinds: { key: string; label: string; count: number; share: number }[];
  recent: { id: string; name: string; size: string; mark: string; kind: string }[];
};

export type LinksPreview = {
  total: number;
  recent: { id: string; title: string; url: string; mark: string }[];
};
