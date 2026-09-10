import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { WORKFLOW_STATUS_OPTIONS } from "@/lib/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
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
          Test Group Name
          <input name="name" defaultValue={defaults?.name} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Description
          <textarea name="description" defaultValue={defaults?.description ?? ""} className={textareaClass} />
        </label>
        <label className={labelClass}>
          Test Objective
          <textarea
            name="testObjective"
            defaultValue={defaults?.testObjective ?? ""}
            className={textareaClass}
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Status
          <Select
            name="status"
            defaultValue={defaults?.status ?? "DRAFT"}
            options={WORKFLOW_STATUS_OPTIONS}
            ariaLabel="Status"
          />
        </label>
        {!hideActions && (
          <div className="mt-2 flex flex-wrap justify-end gap-2 sm:col-span-2">
            <DialogCloseButton />
            <Button type="submit">{submitLabel}</Button>
          </div>
        )}
      </form>
    </>
  );
}
