"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Modal";
import { labelClass, textareaClass } from "@/lib/ui";

/**
 * Where a repair has got to, saved the moment it is pressed.
 *
 * The same bargain `InlineSelect` already struck for the result and status
 * controls: no Save button, because one sitting unpressed down a list of
 * cards is worse than either state, and a mis-press is a press away from
 * being undone and is in the history either way.
 *
 * Three buttons rather than a dropdown, which is where this parts company
 * with `InlineSelect`: the values are a sequence, and a sequence laid out
 * left to right says how far along something is without being opened.
 *
 * `needsNote` is the same idea as that component's, pointed at the one move
 * that is a claim rather than an observation. "Ready to retest" means a Dev
 * says it is fixed; without a word about what was done, the tester reading it
 * has to go and ask, which is the errand this whole page exists to remove.
 * The other two moves save on the press.
 *
 * The value is held here and the server is the authority: once a re-render
 * brings a different one down, that one wins — including when it is something
 * this press did not choose, such as a retest that handed the case back.
 */
export type WorkStateOption = { value: string; label: string };

export function WorkStatePicker({
  action,
  value,
  options,
  needsNote = [],
  noteTitle,
  notePlaceholder,
  label,
}: {
  action: (formData: FormData) => void | Promise<void>;
  value: string;
  options: WorkStateOption[];
  /** Values that may not be saved without a word about them. */
  needsNote?: string[];
  noteTitle: string;
  notePlaceholder?: string;
  /** Names the group, since the buttons share their labels with every other
   *  card on the page. */
  label: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [shown, setShown] = useState(value);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  /* Adjusted while rendering rather than in an effect, so the control never
     paints the old value on its way to the one the server just sent. */
  const [serverValue, setServerValue] = useState(value);
  if (serverValue !== value) {
    setServerValue(value);
    setShown(value);
  }

  function choose(next: string) {
    if (next === shown && !needsNote.includes(next)) {
      return;
    }
    setShown(next);
    /* A note belongs to the move it was written for, so a move that does not
       ask for one must not carry the last one along. */
    if (!needsNote.includes(next)) {
      setNote("");
    }
    if (needsNote.includes(next)) {
      setAsking(true);
      return;
    }
    // requestSubmit, not submit: it runs the form's own submit path, which is
    // where React has attached the action.
    formRef.current?.requestSubmit();
  }

  function cancel() {
    setAsking(false);
    setNote("");
    /* Back to what is actually stored. Leaving the pressed value on screen
       would show a repair as finished that nobody has been told about. */
    setShown(serverValue);
  }

  return (
    <>
      <form ref={formRef} action={action}>
        <input type="hidden" name="workState" value={shown} readOnly />
        {/* Always rendered, never gated on the dialog being open. Writing it
            as `{asking && <input …>}` reads fine and loses every note: Save
            closes the dialog first, which unmounts the field, and the submit
            a frame later carries a form that no longer has it. */}
        <input type="hidden" name="note" value={note} readOnly />
        <div
          role="group"
          aria-label={label}
          className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-black/[.03] p-0.5 dark:bg-white/[.04]"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === shown}
              onClick={() => choose(option.value)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
                option.value === shown
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </form>

      <Dialog open={asking} onClose={cancel} title={noteTitle}>
        <div className="flex flex-col gap-4">
          <label className={labelClass}>
            What did you do?
            <textarea
              autoFocus
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={notePlaceholder}
              className={textareaClass}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={cancel}>
              Cancel
            </Button>
            <Button
              type="button"
              /* Nothing to save until something is written: an empty answer is
                 the thing this dialog exists to prevent. */
              disabled={note.trim() === ""}
              onClick={() => {
                setAsking(false);
                formRef.current?.requestSubmit();
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
