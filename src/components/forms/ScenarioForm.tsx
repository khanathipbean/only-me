import { Button } from "@/components/ui/Button";
import { inputClass, labelClass, selectClass, textareaClass } from "@/lib/ui";
import type { Priority, WorkflowStatus } from "@/generated/prisma/client";

export type ScenarioFormDefaults = {
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
}: {
  action: (formData: FormData) => void;
  defaults?: ScenarioFormDefaults;
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
          Scenario Name
          <input name="name" defaultValue={defaults?.name} required className={inputClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Description
          <textarea name="description" defaultValue={defaults?.description ?? ""} className={textareaClass} />
        </label>
        <label className={labelClass}>
          Preconditions
          <textarea
            name="preconditions"
            defaultValue={defaults?.preconditions ?? ""}
            className={textareaClass}
          />
        </label>
        <label className={labelClass}>
          Test Data
          <textarea name="testData" defaultValue={defaults?.testData ?? ""} className={textareaClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Scenario Steps
          <textarea name="steps" defaultValue={defaults?.steps ?? ""} className={textareaClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Expected Result
          <textarea
            name="expectedResult"
            defaultValue={defaults?.expectedResult}
            required
            className={textareaClass}
          />
        </label>
        <label className={labelClass}>
          Priority
          <select name="priority" required defaultValue={defaults?.priority ?? "MEDIUM"} className={selectClass}>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label className={labelClass}>
          Status
          <select name="status" defaultValue={defaults?.status ?? "DRAFT"} className={selectClass}>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Tags (comma-separated)
          <input name="tags" defaultValue={defaults?.tags} className={inputClass} />
        </label>
        <Button type="submit" className="self-end sm:col-span-2 sm:justify-self-start">
          {submitLabel}
        </Button>
      </form>
    </>
  );
}
