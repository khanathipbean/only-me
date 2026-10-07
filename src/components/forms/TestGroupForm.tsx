import { RequiredMark } from "@/components/forms/RequiredMark";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { StatusField } from "@/components/forms/StatusField";
import { SubmitButton } from "@/components/SubmitButton";
import { inputClass, labelClass, textareaClass } from "@/lib/ui";
import type { WorkflowStatus } from "@/generated/prisma/client";

export type TestGroupFormDefaults = {
  name?: string;
  description?: string | null;
  testObjective?: string | null;
  status?: WorkflowStatus;
};

export function TestGroupForm({
  action,
  defaults,
  submitLabel,
  error,
  formId,
  hideActions = false,
  statusFromChildren = false,
}: {
  action: (formData: FormData) => void;
  defaults?: TestGroupFormDefaults;
  submitLabel: string;
  error?: string;
  /** Lets a submit button outside the form target it via `form="…"`, which is
   * how the footer can sit in the same row as the Manage buttons: those are
   * their own `<form>`s and so can never live inside this one. */
  formId?: string;
  /** Drops the built-in Cancel/Save row — the caller renders it instead. */
  hideActions?: boolean;
  /** This row has live children, so its status is its Test Cases' and the
   *  field becomes a value rather than a choice. See `StatusField`. */
  statusFromChildren?: boolean;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </p>
      )}
      <form id={formId} action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>
          <span>
            Test Group Name
            <RequiredMark />
          </span>
          <input name="name" defaultValue={defaults?.name} required className={inputClass} placeholder="e.g. Validation" />
        </label>
        <label className={labelClass}>
          Description
          <textarea name="description" defaultValue={defaults?.description ?? ""} className={textareaClass} placeholder="What this group covers" />
        </label>
        <label className={labelClass}>
          Test Objective
          <textarea
            name="testObjective"
            placeholder="What you are trying to prove with these Test Cases"
            defaultValue={defaults?.testObjective ?? ""}
            className={textareaClass}
          />
        </label>
        <div className="sm:col-span-2">
          <StatusField
            value={defaults?.status}
            fromChildren={statusFromChildren}
            childNoun="Test Cases"
          />
        </div>
        {!hideActions && (
          <div className="mt-2 flex flex-wrap justify-end gap-2 sm:col-span-2">
            <DialogCloseButton />
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        )}
      </form>
    </>
  );
}
