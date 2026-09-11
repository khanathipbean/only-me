import { RequiredMark } from "@/components/forms/RequiredMark";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { PRIORITY_OPTIONS, WORKFLOW_STATUS_OPTIONS } from "@/lib/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { inputClass, labelClass, textareaClass } from "@/lib/ui";
import type { Priority, WorkflowStatus } from "@/generated/prisma/client";

export type ScenarioFormDefaults = {
  requirementId?: string;
  name?: string;
  description?: string | null;
  preconditions?: string | null;
  testData?: string | null;
  steps?: string | null;
  expectedResult?: string;
  priority?: Priority;
  status?: WorkflowStatus;
  tags?: string;
};

export function ScenarioForm({
  action,
  defaults,
  submitLabel,
  error,
  formId,
  hideActions = false,
  requirements,
}: {
  action: (formData: FormData) => void;
  defaults?: ScenarioFormDefaults;
  submitLabel: string;
  error?: string;
  /** Lets a submit button outside the form target it via `form="…"`, which is
   * how the footer can sit in the same row as the Manage buttons: those are
   * their own `<form>`s and so can never live inside this one. */
  formId?: string;
  /** Drops the built-in Cancel/Save row — the caller renders it instead. */
  hideActions?: boolean;
  /** The project's requirements, for the parent picker. Optional through
   * phase 1: a Scenario can still exist without one. */
  requirements?: { id: string; name: string; code: string | null }[];
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
            Scenario Name
            <RequiredMark />
          </span>
          <input name="name" defaultValue={defaults?.name} required className={inputClass} placeholder="e.g. Log in with a valid account" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Description
          <textarea name="description" defaultValue={defaults?.description ?? ""} className={textareaClass} placeholder="What this scenario covers, in a sentence or two" />
        </label>
        <label className={labelClass}>
          Preconditions
          <textarea
            name="preconditions"
            placeholder="What must already be true before testing — e.g. the account exists and is active"
            defaultValue={defaults?.preconditions ?? ""}
            className={textareaClass}
          />
        </label>
        <label className={labelClass}>
          Test Data
          <textarea name="testData" defaultValue={defaults?.testData ?? ""} className={textareaClass} placeholder="Accounts, values or files this scenario needs" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Scenario Steps
          <textarea name="steps" defaultValue={defaults?.steps ?? ""} className={textareaClass} placeholder="One step per line" />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span>
            Expected Result
            <RequiredMark />
          </span>
          <textarea
            name="expectedResult"
            placeholder="What the system should do when the scenario passes"
            defaultValue={defaults?.expectedResult}
            required
            className={textareaClass}
          />
        </label>
        <label className={labelClass}>
          <span>
            Priority
            <RequiredMark />
          </span>
          <Select
            name="priority"
            defaultValue={defaults?.priority ?? "MEDIUM"}
            options={PRIORITY_OPTIONS}
            required
            ariaLabel="Priority"
          />
        </label>
        <label className={labelClass}>
          Status
          <Select
            name="status"
            defaultValue={defaults?.status ?? "DRAFT"}
            options={WORKFLOW_STATUS_OPTIONS}
            ariaLabel="Status"
          />
        </label>
        {requirements && (
          <label className={labelClass}>
            <span>
              Requirement
              <RequiredMark />
            </span>
            {/* No blank option: a Scenario must belong to a Requirement, so
                an empty choice could only ever be rejected on submit.
                Changing it moves the Scenario to another Requirement. */}
            <Select
              name="requirementId"
              defaultValue={defaults?.requirementId ?? ""}
              required
              options={requirements.map((requirement) => ({
                value: requirement.id,
                label: requirement.code
                  ? `${requirement.code} — ${requirement.name}`
                  : requirement.name,
              }))}
              ariaLabel="Requirement"
            />
          </label>
        )}
        <label className={`${labelClass} sm:col-span-2`}>
          Tags (comma-separated)
          <input name="tags" defaultValue={defaults?.tags} className={inputClass} placeholder="login, regression, smoke" />
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
