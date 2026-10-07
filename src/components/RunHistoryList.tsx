import Link from "next/link";
import { Badge, testResultTone } from "@/components/ui/Badge";
import { formatDate } from "@/lib/dates";
import { summariseHistory, type RunHistoryEntry } from "@/lib/run-history";

/**
 * Every round a Test Case has been in, newest first, with what was written
 * down when it failed.
 *
 * Newest first here, unlike the report's squares, which read oldest-first to
 * make a pattern legible left to right. This is a list someone scans while
 * testing: the last thing that happened is the thing they want, and it
 * should not be at the bottom.
 *
 * The round being worked on is marked rather than left out. Hiding it would
 * leave a list that counts four rounds and shows three, and the reader would
 * be the one to notice.
 */
export function RunHistoryList({
  entries,
  projectId,
  currentRunId,
  emptyMessage,
}: {
  entries: RunHistoryEntry[];
  projectId: string;
  /** Marked as "this round" instead of linked. */
  currentRunId?: string;
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-border bg-black/[.02] px-3 py-3 text-sm text-muted dark:bg-white/[.03]">
        {emptyMessage}
      </p>
    );
  }

  const { rounds, ran, hadFailure } = summariseHistory(entries);
  const newestFirst = [...entries].reverse();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        {/* "3 of 4 rounds" rather than one number: being added to a round and
            being run in it are different, and a single count would be read as
            whichever the reader had in mind. */}
        {ran} of {rounds} round{rounds === 1 ? "" : "s"}
        {hadFailure > 0 && (
          <>
            {" · "}
            {/* "saw a failure" rather than "failed": a round where the tester
                reported a failure and came back to a fix ends green, and
                calling that round failed would contradict the badge beside
                it. It still cost a round trip, which is the point of the
                number. */}
            <span className="text-red-600 dark:text-red-400">
              {hadFailure} saw a failure
            </span>
          </>
        )}
      </p>

      <ul className="flex flex-col gap-1.5">
        {newestFirst.map((entry, index) => {
          /* `currentRunId` can be undefined and `testRunId` null, and those
             must not match: a group recorded outside a round is never the
             round being worked on. */
          const isCurrent = entry.testRunId !== null && entry.testRunId === currentRunId;
          return (
            <li
              key={`${entry.testRunId ?? "loose"}-${index}`}
              className={
                isCurrent
                  ? "flex flex-wrap items-center gap-2 rounded-md border border-brand/40 bg-brand/[.06] px-2.5 py-1.5"
                  : "flex flex-wrap items-center gap-2 px-2.5 py-1"
              }
            >
              <Badge tone={testResultTone(entry.testResult)}>
                {entry.testResult.replace(/_/g, " ")}
              </Badge>

              {isCurrent || entry.testRunId === null ? (
                <span className="text-sm font-medium text-foreground">{entry.runName}</span>
              ) : (
                <Link
                  href={`/projects/${projectId}/runs/${entry.testRunId}`}
                  className="text-sm font-medium text-foreground hover:text-brand hover:underline"
                >
                  {entry.runName}
                </Link>
              )}

              {isCurrent ? (
                <span className="text-xs text-brand">this round</span>
              ) : entry.testRunId === null ? (
                /* The name is already the date, so saying when would repeat
                   it. What is worth saying is that it was not in a round. */
                <span className="text-xs text-muted">
                  outside a round{entry.ranBy && ` · ${entry.ranBy}`}
                </span>
              ) : entry.ranAt ? (
                <span className="text-xs text-muted">
                  {formatDate(entry.ranAt)}
                  {entry.ranBy && ` · ${entry.ranBy}`}
                </span>
              ) : (
                /* In the round and never recorded — not the same as "not
                   reached yet", and the word is what says so. */
                <span className="text-xs text-muted">skipped</span>
              )}

              {entry.notes && !isCurrent && (
                <span className="w-full text-xs text-muted">{entry.notes}</span>
              )}

              {/* What happened inside the round before it settled. The badge
                  above holds only the last answer, so a round that was
                  reported broken, fixed and retested looks from the outside
                  exactly like one that passed first time — and that is most
                  rounds, which is why nothing ever appeared to go wrong. */}
              {entry.attempts.length > 1 && (
                <ul className="w-full border-l border-border pl-2.5 text-xs text-muted">
                  {entry.attempts.slice(0, -1).map((attempt, index) => (
                    <li key={index} className="flex flex-wrap items-baseline gap-1.5 py-0.5">
                      <span
                        className={
                          attempt.testResult === "FAILED"
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "font-medium text-foreground"
                        }
                      >
                        {attempt.testResult.replace(/_/g, " ").toLowerCase()}
                      </span>
                      <span>
                        {formatDate(attempt.recordedAt)}
                        {attempt.recordedBy && ` · ${attempt.recordedBy}`}
                      </span>
                      {attempt.notes && <span className="w-full">{attempt.notes}</span>}
                    </li>
                  ))}
                  <li className="py-0.5">then recorded again</li>
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
