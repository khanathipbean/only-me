import { Button } from "@/components/ui/Button";
import { inputClass, labelClass, selectClass, textareaClass } from "@/lib/ui";
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
}: {
  action: (formData: FormData) => void;
  defaults?: TestGroupFormDefaults;
  submitLabel: string;
  error?: string;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </p>
      )}
      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <select name="status" defaultValue={defaults?.status ?? "DRAFT"} className={selectClass}>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <Button type="submit" className="self-end sm:col-span-2 sm:justify-self-start">
          {submitLabel}
        </Button>
      </form>
    </>
  );
}
