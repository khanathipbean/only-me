"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ClearIcon } from "@/components/icons";
import { Select } from "@/components/ui/Select";
import { SubmitButton } from "@/components/SubmitButton";
import { TEST_RESULT_OPTIONS } from "@/lib/enums";
import { checkboxClass } from "@/lib/ui";

/**
 * Selecting several cases in a round, so one action can reach all of them.
 *
 * The selection is client state and the table around it is not, which is why
 * this is a provider rather than a component that renders the table: the rows
 * stay server-rendered — each keeps its own result form, its expandable
 * detail, its attachments — and only the checkbox in each row and the panel
 * at the bottom are client. A client component that owned the whole table
 * would have to receive every row's contents as props, and the detail pane
 * alone carries steps, attachments and file previews.
 *
 * Off by default, behind a Select button. This table already runs to seven
 * columns with long names in them; a checkbox column that is there all the
 * time costs every reader width for something used occasionally.
 */

type SelectionValue = {
  /** Off until someone presses Select — the checkbox column doesn't exist. */
  active: boolean;
  selected: Set<string>;
  toggle: (testCaseId: string) => void;
  /** Every row of one Test Group's table at once, from the checkbox in its
   *  header. Takes the whole set rather than toggling each: "tick the header"
   *  has to mean the same thing whether none, some or all of them were
   *  already on. */
  setMany: (testCaseIds: string[], on: boolean) => void;
  /** Turning the mode off also drops what was ticked: leaving it behind would
   *  have the next Select open onto a selection nobody remembers making. */
  toggleMode: () => void;
};

const SelectionContext = createContext<SelectionValue | null>(null);

function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) {
    throw new Error("RunCaseSelection.* must be used inside <RunCaseSelection>");
  }
  return value;
}

export type SelectableCase = {
  testCaseId: string;
  /** A case whose result is recorded can't be removed — the result and its
   *  attachments would go with it. It can still be selected, because setting
   *  a result over it is fine; the panel counts these out of Remove alone. */
  ran: boolean;
};

export function RunCaseSelection({
  cases,
  setResultAction,
  removeAction,
  children,
}: {
  cases: SelectableCase[];
  setResultAction: (formData: FormData) => void;
  removeAction: (formData: FormData) => void;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /* No default result. A panel that opens already reading "Passed" is one
   * mis-click from marking a batch passed that nobody looked at, and Save
   * would be offering to do it before any decision was made. Choosing is the
   * step that makes Save appear. */
  const [result, setResult] = useState("");

  /* Only what is on this page. The list is paginated, and a count on a button
   * that doesn't match what the button will touch is the worst thing this
   * feature could do. Leaving the page drops the selection for the same
   * reason. */
  const onPage = cases.filter((row) => selected.has(row.testCaseId));
  const removable = onPage.filter((row) => !row.ran);
  const allSelected = cases.length > 0 && onPage.length === cases.length;

  const value = useMemo<SelectionValue>(
    () => ({
      active,
      selected,
      toggle: (testCaseId) =>
        setSelected((previous) => {
          const next = new Set(previous);
          if (!next.delete(testCaseId)) {
            next.add(testCaseId);
          }
          return next;
        }),
      setMany: (testCaseIds, on) =>
        setSelected((previous) => {
          const next = new Set(previous);
          for (const id of testCaseIds) {
            if (on) {
              next.add(id);
            } else {
              next.delete(id);
            }
          }
          return next;
        }),
      toggleMode: () =>
        setActive((on) => {
          if (on) {
            setSelected(new Set());
            setResult("");
          }
          return !on;
        }),
    }),
    [active, selected],
  );

  function close() {
    setActive(false);
    setSelected(new Set());
    setResult("");
  }

  return (
    <SelectionContext.Provider value={value}>
      {children}

      {active && (
        /* Fixed to the bottom of the window rather than the end of the list:
           the rows being acted on are the ones in view, and a panel that
           scrolls away leaves someone ticking rows with no way to act on
           them without scrolling back. */
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-2xl backdrop-blur-lg">
            {/* The count first: it is what the rest of the row acts on, and
                every button beside it reads as "…these". */}
            <span className="text-sm font-medium text-foreground">
              {onPage.length} selected
            </span>
            {/* Select all lives here rather than in a row of its own above the
                table: the panel is the only thing on screen that belongs to
                the selection, and a second strip for two controls pushed the
                list down for everyone, mode or no mode. */}
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(cases.map((row) => row.testCaseId)))
              }
            >
              {allSelected ? "Clear all" : `Select all ${cases.length}`}
            </Button>

            <form action={setResultAction} className="flex items-center gap-2">
              {onPage.map((row) => (
                <input key={row.testCaseId} type="hidden" name="testCaseId" value={row.testCaseId} />
              ))}
              <Select
                name="testResult"
                value={result}
                onChange={setResult}
                options={[{ value: "", label: "Set result…" }, ...TEST_RESULT_OPTIONS]}
                ariaLabel="Result to record for the selected cases"
                /* Nothing ticked, nothing to set it on. Disabled rather than
                   hidden so the panel keeps its shape as rows are ticked. */
                disabled={onPage.length === 0}
                className="max-w-40"
              />
              {/* Appears on choosing a result, rather than sitting there
                  greyed: until then there is no action to describe, and an
                  always-present Save invites the click that a default value
                  would have made destructive. */}
              {result !== "" && (
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save
                </SubmitButton>
              )}
            </form>

            <form
              action={removeAction}
              onSubmit={(event) => {
                const skipped = onPage.length - removable.length;
                const message =
                  skipped > 0
                    ? `Remove ${removable.length} from this run? ${skipped} already ` +
                      `${skipped === 1 ? "has a result and will be" : "have results and will be"} kept.`
                    : `Remove ${removable.length} from this run?`;
                if (!window.confirm(message)) {
                  event.preventDefault();
                }
              }}
            >
              {removable.map((row) => (
                <input key={row.testCaseId} type="hidden" name="testCaseId" value={row.testCaseId} />
              ))}
              {/* The count is the removable ones, not everything ticked: the
                  button says what it will actually do before it is pressed,
                  and goes dead rather than lying when that number is zero. */}
              <SubmitButton
                variant="secondary"
                pendingLabel="Removing…"
                disabled={removable.length === 0}
              >
                Remove ({removable.length})
              </SubmitButton>
            </form>

            <Button
              type="button"
              variant="ghost"
              onClick={close}
              aria-label="Cancel selection"
              title="Cancel selection"
            >
              <ClearIcon />
            </Button>
          </div>
        </div>
      )}
    </SelectionContext.Provider>
  );
}

/**
 * The header cell: a checkbox that takes the whole Test Group its table holds.
 *
 * One Select turns the mode on; this is where a scope is chosen. A Test Group
 * is the right unit for it because its table is always whole on one page —
 * a Module's cases can be split across two, and a control offering to select
 * a Module while reaching only part of it is the kind of lie this feature has
 * been avoiding all along.
 *
 * Empty `<th>` while the mode is off, so the table keeps its column count
 * either way and nothing re-measures.
 */
export function RunCaseSelectHeader({
  testCaseIds,
  className,
}: {
  testCaseIds: string[];
  className?: string;
}) {
  const { active, selected, setMany } = useSelection();
  const ref = useRef<HTMLInputElement>(null);

  const chosen = testCaseIds.filter((id) => selected.has(id)).length;
  const all = testCaseIds.length > 0 && chosen === testCaseIds.length;

  /* `indeterminate` is a property, not an attribute — React has no prop for
   * it, so a partly-ticked group would otherwise read as simply unticked. */
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = chosen > 0 && !all;
    }
  }, [chosen, all]);

  return (
    <th className={className}>
      {active && (
        <input
          ref={ref}
          type="checkbox"
          className={checkboxClass}
          checked={all}
          onChange={() => setMany(testCaseIds, !all)}
          aria-label="Select every case in this Test Group"
        />
      )}
    </th>
  );
}

export function RunCaseSelectCell({
  testCaseId,
  name,
  className,
}: {
  testCaseId: string;
  name: string;
  className?: string;
}) {
  const { active, selected, toggle } = useSelection();
  return (
    <td className={className}>
      {active && (
        <input
          type="checkbox"
          className={checkboxClass}
          checked={selected.has(testCaseId)}
          onChange={() => toggle(testCaseId)}
          aria-label={`Select ${name}`}
        />
      )}
    </td>
  );
}

/**
 * The button that turns the mode on and off, for the page header — where the
 * round's other page-level actions already are. It reads the same context the
 * panel does, so it can say which way it will go.
 */
export function RunCaseSelectToggle() {
  const { active, toggleMode } = useSelection();
  return (
    <Button type="button" variant="secondary" onClick={toggleMode}>
      {active ? "Cancel selection" : "Select cases"}
    </Button>
  );
}
