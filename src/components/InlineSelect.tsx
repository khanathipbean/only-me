"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select, type SelectOption } from "@/components/ui/Select";
import { labelClass, textareaClass } from "@/lib/ui";

/**
 * A Select that saves the moment it is changed.
 *
 * The list showed a case's result and status as badges, and changing either
 * meant opening the row's Edit dialog, finding the field among a dozen
 * others, and saving the whole case. For the two fields that change most
 * often — a result after a test, a status when a case is finished — that is
 * five interactions for one decision.
 *
 * There is no Save button on purpose: one would sit unpressed down a long
 * list, and a row left looking changed but unsaved is worse than either
 * state. The trade is that a mis-click writes immediately; both fields are a
 * fixed set of values, the previous one is a click away, and every change is
 * in the audit log.
 *
 * `needsNote` is the exception. Recording a failure without saying what
 * happened leaves a red square nobody can act on, and the report that
 * collects those squares then shows a row whose whole point is the note it
 * does not have. Those values stop and ask; every other value still saves on
 * the click.
 *
 * The value is held here and handed to Select rather than left to it. React
 * resets a form once its action resolves, and an uncontrolled Select answers
 * that reset by reading its hidden <select> back — which the reset has just
 * returned to the value it had when the page was built. The row then showed
 * the old answer over a row that had already been changed, and only a reload
 * put it right.
 */
export function InlineSelect({
  action,
  name,
  defaultValue,
  options,
  ariaLabel,
  needsNote = [],
  noteTitle = "Say what happened",
  className = "",
}: {
  /** A server action taking this one field, plus `notes` where one was asked for. */
  action: (formData: FormData) => void | Promise<void>;
  name: string;
  defaultValue: string;
  options: SelectOption[];
  /** Required: the column heading is not read out with the control, so
   *  without this it announces only its value. */
  ariaLabel: string;
  /** Values that may not be saved without a note. */
  needsNote?: string[];
  noteTitle?: string;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [shown, setShown] = useState(defaultValue);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");

  /* The server is the authority. Once it has re-rendered the row, whatever it
     says wins — including when it says something the click did not, such as a
     value another tab changed first. Adjusted while rendering rather than in
     an effect: React re-runs this pass before touching the screen, so the row
     never paints the stale value on its way to the right one. */
  const [serverValue, setServerValue] = useState(defaultValue);
  if (serverValue !== defaultValue) {
    setServerValue(defaultValue);
    setShown(defaultValue);
  }

  function cancel() {
    setAsking(false);
    setNote("");
    /* Back to what is actually stored. Leaving the chosen value on screen
       would show a failure the database never heard about. */
    setShown(serverValue);
  }

  return (
    <>
      <form ref={formRef} action={action}>
        <Select
          name={name}
          value={shown}
          options={options}
          ariaLabel={ariaLabel}
          autoWidth
          className={className}
          onChange={(next) => {
            setShown(next);
            if (needsNote.includes(next)) {
              setAsking(true);
              return;
            }
            /* A note belongs to the answer it was written for, so an answer
               that does not ask for one must not carry the last one along. */
            setNote("");
            /* requestSubmit rather than submit: it runs the form's own submit
               path, which is what React's action is attached to. */
            formRef.current?.requestSubmit();
          }}
        />
        {/* Always rendered, and empty unless a note was asked for and given.
            It used to be written `{asking && <input …>}`, which reads
            correctly and lost every note: Save closes the dialog first, that
            unmounts the field, and the submit a frame later carried a form
            without it. The result was stored, the explanation of the failure
            was not, and nothing said so.

            An empty value is still safe to send: `updateTestResultAndNotes`
            is given `undefined` for an empty string by the action, and
            leaves whatever note the case already carries alone. */}
        <input type="hidden" name="notes" value={note} readOnly />
      </form>

      <Dialog open={asking} onClose={cancel} title={noteTitle}>
        <div className="flex flex-col gap-4">
          <label className={labelClass}>
            Actual Result
            <textarea
              autoFocus
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What happened instead?"
              className={textareaClass}
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={cancel}>
              Cancel
            </Button>
            <Button
              type="button"
              /* Nothing to save until something is written: an empty note is
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
