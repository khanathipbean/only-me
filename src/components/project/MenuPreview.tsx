"use client";

import { toneBarClass, testResultTone, type Tone } from "@/components/ui/Badge";
import type { MenuPreview as Payload } from "@/lib/menu-preview-types";

/**
 * The drawing beside a nav menu's list.
 *
 * Each section is drawn as the shape of its own page — a ring for how far the
 * testing has got, bars for the problems, a week of columns for the trail,
 * the real first lines for the notes — so a reader can tell which page they
 * are pointing at without reading a word of it.
 *
 * Every colour comes from the app's own tone table (`Badge`), not from a
 * second palette written here: green is PASSED everywhere in this app, and a
 * preview that picked its own greens would be a second opinion about what a
 * result looks like. It also means both themes are handled by construction —
 * these panels open over a white surface as often as a near-black one.
 *
 * Nothing here reaches a database. It is handed the payload and draws it,
 * which is what keeps it a client component: importing a *value* from
 * `@/lib/menu-preview` would drag Prisma into the browser bundle.
 */

/** Which section of the payload a menu item stands for. */
export type PreviewKey = keyof Payload;

const eyebrowClass = "text-[10px] font-semibold uppercase tracking-wider text-muted";
const figureClass = "text-sm font-semibold tabular-nums text-foreground";
const ruleClass = "border-t border-border pt-2.5";

/** SVG strokes for the ring, by the same tone names the bars use. Tailwind
 *  needs the class written out to emit it, so these cannot be built from
 *  `toneBarClass` by swapping a prefix. */
const TONE_STROKE: Record<Tone, string> = {
  gray: "stroke-slate-400 dark:stroke-slate-500",
  blue: "stroke-blue-500",
  green: "stroke-emerald-500",
  red: "stroke-red-500",
  amber: "stroke-amber-500",
  purple: "stroke-purple-500",
  indigo: "stroke-indigo-500",
  cyan: "stroke-cyan-500",
};

export function MenuPreview({
  section,
  label,
  data,
  loading,
}: {
  section: PreviewKey;
  /** The page this pane is about, for the line at the foot of it. */
  label: string;
  data: Payload | null;
  loading: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="min-h-0 flex-1">{body(section, data, loading)}</div>
      {/* Anchored to the bottom, which is the other half of what it is for:
          a pane is as tall as the list beside it however much it has to
          say, and a drawing floating above an inch of nothing reads as a
          panel that failed to finish loading. */}
      <span className="mt-3 pt-1 text-xs font-medium text-brand">Open {label} &rarr;</span>
    </div>
  );
}

function body(section: PreviewKey, data: Payload | null, loading: boolean) {
  if (loading || !data) {
    return <PreviewSkeleton />;
  }
  switch (section) {
    case "summary":
      return data.summary ? <SummaryPanel data={data.summary} /> : <PreviewSkeleton />;
    case "dashboard":
      return data.dashboard ? <DashboardPanel data={data.dashboard} /> : <PreviewSkeleton />;
    case "problems":
      return data.problems ? <ProblemsPanel data={data.problems} /> : <PreviewSkeleton />;
    case "audit":
      return data.audit ? <AuditPanel data={data.audit} /> : <PreviewSkeleton />;
    case "notes":
      return data.notes ? <NotesPanel data={data.notes} /> : <PreviewSkeleton />;
    case "files":
      return data.files ? <FilesPanel data={data.files} /> : <PreviewSkeleton />;
    case "links":
      return data.links ? <LinksPanel data={data.links} /> : <PreviewSkeleton />;
    default:
      return <PreviewSkeleton />;
  }
}

/**
 * The shape of what is coming, at its real size, so nothing jumps when the
 * figures land — and what stays on screen for good if the fetch never
 * answers. No spinner and no error: the menu beside it is a working list of
 * links either way, and an apology for a number nobody asked for would be
 * louder than the number.
 */
function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true" data-testid="menu-preview-skeleton">
      <span className="h-2.5 w-24 rounded-full bg-black/[.06] dark:bg-white/[.07]" />
      <span className="h-6 w-28 rounded bg-black/[.05] dark:bg-white/[.05]" />
      <div className="flex flex-col gap-2">
        {["62%", "48%", "70%"].map((width) => (
          <span
            key={width}
            style={{ width }}
            className="h-2 rounded-full bg-black/[.05] dark:bg-white/[.05]"
          />
        ))}
      </div>
    </div>
  );
}

/** What a section with nothing in it yet draws: the same frame, at rest,
 *  saying what will be here rather than showing an empty box. */
function AtRest({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <span className="text-xs leading-snug text-muted">{detail}</span>
    </div>
  );
}

function SummaryPanel({ data }: { data: NonNullable<Payload["summary"]> }) {
  if (data.testCases === 0) {
    return (
      <AtRest
        title="Nothing drawn up yet"
        detail="Import a test-case file, or add a module by hand, and this fills in on its own."
      />
    );
  }

  /* Indigo through to cyan: one family rather than a new hue per module, so
     the bar reads as one project cut into parts and never borrows the red
     and green that mean something elsewhere. */
  const tones: Tone[] = ["indigo", "blue", "cyan"];

  return (
    <div className="flex flex-col gap-3">
      <span className={eyebrowClass}>What this project is made of</span>

      <div className="flex h-6 overflow-hidden rounded-md">
        {data.modules.map((module, index) => (
          <span
            key={module.id}
            style={{ width: `${module.share}%` }}
            className={`${toneBarClass(tones[index % tones.length])} border-r-2 border-background`}
          />
        ))}
        {data.otherModules > 0 && <span className="flex-1 bg-slate-300 dark:bg-slate-600" />}
      </div>

      <div className="flex flex-col gap-1.5">
        {data.modules.map((module, index) => (
          <span key={module.id} className="flex items-center gap-2 text-xs">
            <span
              className={`size-2 shrink-0 rounded-xs ${toneBarClass(tones[index % tones.length])}`}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{module.name}</span>
            <span className="tabular-nums text-muted">{module.testCases}</span>
          </span>
        ))}
        {data.otherModules > 0 && (
          <span className="flex items-center gap-2 text-xs">
            <span className="size-2 shrink-0 rounded-xs bg-slate-300 dark:bg-slate-600" />
            <span className="min-w-0 flex-1 truncate text-muted">
              {data.otherModules} more module{data.otherModules === 1 ? "" : "s"}
            </span>
          </span>
        )}
      </div>

      <div className={`flex gap-4 ${ruleClass}`}>
        {[
          { value: data.requirements, label: "requirements" },
          { value: data.scenarios, label: "scenarios" },
          { value: data.testGroups, label: "test groups" },
        ].map((stat) => (
          <span key={stat.label} className="flex flex-col">
            <span className={figureClass}>{stat.value}</span>
            <span className="text-[10px] text-muted">{stat.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const RING_RADIUS = 34;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
/** A sliver of the surface between arcs, so two that touch stay two — which
 *  is the separation a colour-blind reader has instead of the hue. */
const RING_GAP = 1.5;

function DashboardPanel({ data }: { data: NonNullable<Payload["dashboard"]> }) {
  if (data.testCases === 0) {
    return (
      <div className="flex flex-col gap-3">
        <span className={eyebrowClass}>Run so far</span>
        <div className="flex items-center gap-3">
          <RingFrame label="Nothing run yet" centre={<RingCentre value="0%" />}>
            <circle
              cx="48"
              cy="48"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="11"
              strokeDasharray="3 6"
              className="stroke-border"
            />
          </RingFrame>
          <AtRest
            title="No test runs yet"
            detail="Start a round and this fills in as results come back."
          />
        </div>
      </div>
    );
  }

  /* Ordered so everything with a verdict is one unbroken run and what is
     left to do closes the ring. */
  const arcs = [
    { key: "PASSED", label: "Passed", value: data.passed },
    { key: "SKIPPED", label: "Skipped", value: data.skipped },
    { key: "BLOCKED", label: "Blocked", value: data.blocked },
    { key: "FAILED", label: "Failed", value: data.failed },
    { key: "NOT_RUN", label: "Not run", value: data.notRun },
  ].map((arc) => ({ ...arc, tone: testResultTone(arc.key) }));

  let offset = 0;
  const drawn = arcs.map((arc) => {
    const length = (arc.value / data.testCases) * RING_LENGTH;
    const segment = { ...arc, length, offset };
    offset += length;
    return segment;
  });

  return (
    <div className="flex flex-col gap-3">
      <span className={eyebrowClass}>Run so far</span>

      <div className="flex items-center gap-3">
        <RingFrame
          label={`${Math.round(data.progress)} percent of ${data.testCases} cases run`}
          centre={<RingCentre value={`${Math.round(data.progress)}%`} />}
        >
          {drawn
            .filter((arc) => arc.length > 0)
            .map((arc) => (
              <circle
                key={arc.key}
                cx="48"
                cy="48"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="11"
                /* The gap is taken off the arc, never off the offset: the
                   next one has to start where this one would have ended or
                   the ring drifts round as it is drawn. */
                strokeDasharray={`${Math.max(0, arc.length - RING_GAP)} ${RING_LENGTH}`}
                strokeDashoffset={-arc.offset}
                className={TONE_STROKE[arc.tone]}
              />
            ))}
        </RingFrame>

        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5">
          {arcs
            .filter((arc) => arc.value > 0)
            .map((arc) => (
              <span key={arc.key} className="flex items-center gap-1.5 text-xs">
                <span className={`size-2 shrink-0 rounded-xs ${toneBarClass(arc.tone)}`} />
                <span className="min-w-0 flex-1 truncate text-muted">{arc.label}</span>
                <span className="font-semibold tabular-nums text-foreground">{arc.value}</span>
              </span>
            ))}
        </div>
      </div>

      {data.failed > 0 && (
        <span className={`flex items-center gap-2 text-xs text-muted ${ruleClass}`}>
          <span className={`size-2 shrink-0 rounded-full ${toneBarClass("red")}`} />
          <span>
            <span className="font-semibold text-foreground">{data.failed} failed</span> across{" "}
            {data.failedModules} module{data.failedModules === 1 ? "" : "s"}
          </span>
        </span>
      )}

      {/* The ring above is the project's whole life. This is the sitting
          somebody is in, which is usually why the Dashboard is opened. */}
      {data.latestRun && data.latestRun.total > 0 && (
        <div className={`flex flex-col gap-1.5 ${data.failed > 0 ? "" : ruleClass}`}>
          <span className="flex items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-foreground">{data.latestRun.name}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {data.latestRun.answered} of {data.latestRun.total}
            </span>
          </span>
          <span className="h-1.5 rounded-full bg-black/[.06] dark:bg-white/[.07]">
            <span
              style={{ width: `${(data.latestRun.answered / data.latestRun.total) * 100}%` }}
              className={`block h-1.5 rounded-full ${toneBarClass("indigo")}`}
            />
          </span>
        </div>
      )}
    </div>
  );
}

function RingFrame({
  label,
  centre,
  children,
}: {
  label: string;
  /** Drawn outside the rotation, which is the whole reason it is a prop and
   *  not another child: inside it, the figure came out lying on its side. */
  centre: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <svg viewBox="0 0 96 96" role="img" aria-label={label} className="size-20 shrink-0">
      {/* Rotated so the first arc starts at the top, where a reader's eye
          begins, rather than at three o'clock. The rotation is for the arcs
          alone — a transform on a group turns everything in it. */}
      <g transform="rotate(-90 48 48)">{children}</g>
      {centre}
    </svg>
  );
}

function RingCentre({ value }: { value: string }) {
  return (
    <>
      <text
        x="48"
        y="46"
        textAnchor="middle"
        className="fill-foreground text-[19px] font-bold tabular-nums"
      >
        {value}
      </text>
      <text x="48" y="60" textAnchor="middle" className="fill-muted text-[9px]">
        run
      </text>
    </>
  );
}

function ProblemsPanel({ data }: { data: NonNullable<Payload["problems"]> }) {
  if (data.total === 0) {
    return (
      <AtRest
        title="Nothing needs a second look"
        detail="Cases that break, never pass, or keep being reworked show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-baseline gap-2">
        <span className="text-2xl font-bold leading-none tabular-nums text-red-600 dark:text-red-400">
          {data.total}
        </span>
        <span className="text-xs text-muted">
          case{data.total === 1 ? "" : "s"} want a second look
        </span>
      </span>

      {/* One colour across the three: they are three shapes of the same
          trouble, read against each other, not three different states. */}
      <div className="flex flex-col gap-2">
        {data.patterns
          .filter((pattern) => pattern.count > 0)
          .map((pattern) => (
            <div key={pattern.key} className="flex items-center gap-2.5">
              <span className="w-20 shrink-0 truncate text-xs text-foreground">
                {pattern.label}
              </span>
              <span className="h-2 flex-1 rounded-full bg-black/[.06] dark:bg-white/[.07]">
                <span
                  style={{ width: `${pattern.share}%` }}
                  className={`block h-2 rounded-full ${toneBarClass("red")}`}
                />
              </span>
              <span className="w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                {pattern.count}
              </span>
            </div>
          ))}
      </div>

      {/* The cases themselves, most failures first — the same order the
          page reads in, so the two cannot name different offenders. */}
      {data.worst.length > 0 && (
        <div className={`flex flex-col gap-1.5 ${ruleClass}`}>
          {data.worst.map((problem) => (
            <span key={problem.id} className="flex min-w-0 items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-foreground">{problem.name}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {problem.failures} fail{problem.failures === 1 ? "" : "s"}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditPanel({ data }: { data: NonNullable<Payload["audit"]> }) {
  if (data.total === 0 && data.recent.length === 0) {
    return (
      <AtRest
        title="Nothing recorded yet"
        detail="Every change made inside this project is written down here."
      />
    );
  }

  const today = data.week.length - 1;

  return (
    <div className="flex flex-col gap-3">
      <span className={eyebrowClass}>
        Last seven days · {data.total} change{data.total === 1 ? "" : "s"}
      </span>

      {/* The trail is a record over time, so time is what is drawn. */}
      <div className="flex h-14 items-end gap-1.5">
        {data.week.map((day, index) => (
          <span key={index} className="flex h-full flex-1 flex-col justify-end gap-1">
            <span
              style={{ height: `${day.share}%` }}
              className={`min-h-0.5 w-full rounded-t ${
                index === today ? "bg-brand" : "bg-brand/35"
              }`}
            />
            <span
              className={`text-center text-[9px] ${
                index === today ? "text-foreground" : "text-muted"
              }`}
            >
              {day.day}
            </span>
          </span>
        ))}
      </div>

      {data.recent.length > 0 && (
        <div className={`flex flex-col gap-1.5 ${ruleClass}`}>
          {data.recent.map((entry) => (
            <span key={entry.id} className="flex min-w-0 items-center gap-2 text-xs">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[9px] font-bold text-brand">
                {entry.initials}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground">{entry.what}</span>
              <span className="shrink-0 text-muted">{entry.when}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function NotesPanel({ data }: { data: NonNullable<Payload["notes"]> }) {
  if (data.total === 0) {
    return (
      <AtRest
        title="No notes yet"
        detail="What a meeting decided, and why something reads as it does."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className={eyebrowClass}>
        {data.total} note{data.total === 1 ? "" : "s"} · newest first
      </span>

      {/* A note has no figure worth drawing; what it has is its first line. */}
      <div className="flex flex-col gap-1.5">
        {data.recent.map((note) => (
          <div
            key={note.id}
            className="flex flex-col gap-0.5 rounded-lg border border-border border-l-2 border-l-brand bg-surface px-2.5 py-1.5"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                {note.title}
              </span>
              <span className="shrink-0 text-[10px] text-muted">{note.on}</span>
            </span>
            {note.line && (
              <span className="truncate text-[11px] leading-snug text-muted">{note.line}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Files are a pile with a size, so the drawing is the pile. One family of
 *  hues again: a file's kind is not a status. */
const FILE_TONES: Tone[] = ["indigo", "blue", "cyan"];

function FilesPanel({ data }: { data: NonNullable<Payload["files"]> }) {
  if (data.total === 0) {
    return (
      <AtRest
        title="No files yet"
        detail="Documents kept against this project, grouped by module."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className={eyebrowClass}>
        {data.total} file{data.total === 1 ? "" : "s"} · {data.size}
      </span>

      <div className="flex h-2.5 overflow-hidden rounded-full">
        {data.kinds.map((kind, index) => (
          <span
            key={kind.key}
            style={{ width: `${kind.share}%` }}
            className={`${toneBarClass(FILE_TONES[index % FILE_TONES.length])} border-r-2 border-background`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {data.kinds.map((kind, index) => (
          <span key={kind.key} className="flex items-center gap-1.5 text-[10px] text-muted">
            <span
              className={`size-2 rounded-xs ${toneBarClass(FILE_TONES[index % FILE_TONES.length])}`}
            />
            <span className="text-foreground">{kind.label}</span> {kind.count}
          </span>
        ))}
      </div>

      <div className={`flex flex-col gap-2 ${ruleClass}`}>
        {data.recent.map((file) => (
          <span key={file.id} className="flex min-w-0 items-center gap-2">
            <span className="flex size-5.5 shrink-0 items-center justify-center rounded-md bg-black/[.06] text-[8px] font-bold text-muted dark:bg-white/[.08]">
              {file.mark}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{file.name}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted">{file.size}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function LinksPanel({ data }: { data: NonNullable<Payload["links"]> }) {
  if (data.total === 0) {
    return (
      <AtRest title="No links yet" detail="Addresses for the things that live somewhere else." />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className={eyebrowClass}>
        {data.total} link{data.total === 1 ? "" : "s"}
      </span>

      {/* A link is an address, so the address is what is drawn large, in the
          typeface addresses belong in. */}
      <div className="flex flex-col gap-1.5">
        {data.recent.map((link) => (
          <div
            key={link.id}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand/15 text-[9px] font-bold text-brand">
              {link.mark}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-mono text-[11px] text-foreground">{link.url}</span>
              <span className="truncate text-[10px] text-muted">{link.title}</span>
            </span>
          </div>
        ))}
      </div>

      <span className="text-[10px] leading-snug text-muted">
        Each one opens in a new tab, so this stays where it is.
      </span>
    </div>
  );
}
