import { RequiredMark } from "@/components/forms/RequiredMark";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { PRIORITY_OPTIONS, WORKFLOW_STATUS_OPTIONS } from "@/lib/enums";
import { Select } from "@/components/ui/Select";
import { SubmitButton } from "@/components/SubmitButton";
import { inputClass, labelClass, textareaClass } from "@/lib/ui";
import type { Priority, WorkflowStatus } from "@/generated/prisma/client";

export type RequirementFormDefaults = {
  name?: string;
  code?: string | null;
  description?: string | null;
  moduleId?: string;
  feature?: string | null;
  priority?: Priority;
  status?: WorkflowStatus;
};

export function RequirementForm({
  action,
  defaults,
  submitLabel,
  error,
  modules,
  features = [],
  formId,
  hideActions = false,
}: {
  action: (formData: FormData) => void;
  defaults?: RequirementFormDefaults;
  submitLabel: string;
  error?: string;
  /** Every Module in the project, so a Requirement can be moved between them. */
  modules: { id: string; name: string }[];
  /** Features already used in this Module, offered as suggestions. */
  features?: string[];
  formId?: string;
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
        <label className={labelClass}>
          <span>
            Requirement Name
            <RequiredMark />
          </span>
          <input
            name="name"
            defaultValue={defaults?.name}
            required
            placeholder="e.g. A user can filter the Dashboard"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Reference
          <input
            name="code"
            defaultValue={defaults?.code ?? ""}
            placeholder="e.g. REQ-014"
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Description
          <textarea
            name="description"
            defaultValue={defaults?.description ?? ""}
            placeholder="What the Feature doc says this must do"
            className={textareaClass}
          />
        </label>
        <label className={labelClass}>
          <span>
            Module
            <RequiredMark />
          </span>
          {/* Changing it moves the Requirement to another Module's list. */}
          <Select
            name="moduleId"
            defaultValue={defaults?.moduleId ?? ""}
            required
            options={modules.map((module) => ({ value: module.id, label: module.name }))}
            ariaLabel="Module"
          />
        </label>
        <label className={labelClass}>
          Feature
          {/* A suggestion list, not a closed set: a Module's first Requirement
              has nothing to pick from, and only the ones big enough to have
              sub-features use this at all. Matching an existing entry is
              re-spelled to it server-side so case can't split a group. */}
          <input
            name="feature"
            defaultValue={defaults?.feature ?? ""}
            list={`${formId ?? "requirement"}-features`}
            placeholder="Sub-area of the module, e.g. Policy Center"
            className={inputClass}
          />
          <datalist id={`${formId ?? "requirement"}-features`}>
            {features.map((feature) => (
              <option key={feature} value={feature} />
            ))}
          </datalist>
        </label>
        <label className={labelClass}>
          <span>
            Priority
            <RequiredMark />
          </span>
          <Select
            name="priority"
            defaultValue={defaults?.priority ?? "MEDIUM"}
            required
            options={PRIORITY_OPTIONS}
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
