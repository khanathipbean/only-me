import { TestStepEditor, type StepDraft } from "@/components/TestStepEditor";
import { Button } from "@/components/ui/Button";
import { inputClass, labelClass, selectClass, textareaClass } from "@/lib/ui";
import type { Priority, TestType, WorkflowStatus } from "@/generated/prisma/client";

export type TestCaseFormDefaults = {
  name?: string;
  condition?: string | null;
  preconditions?: string | null;
  testData?: string | null;
  expectedResult?: string;
  priority?: Priority;
  testType?: TestType | null;
  status?: WorkflowStatus;
  steps?: StepDraft[];
};

export function TestCaseForm({
  action,
  defaults,
  submitLabel,
  error,
}: {
  action: (formData: FormData) => void;
  defaults?: TestCaseFormDefaults;
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
      <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className={`${labelClass} sm:col-span-3`}>
          Test Case Name
          <input name="name" defaultValue={defaults?.name} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Condition
          <textarea name="condition" defaultValue={defaults?.condition ?? ""} className={textareaClass} />
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
        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <span className="text-sm font-medium text-foreground">Test Steps</span>
          <TestStepEditor fieldName="stepsJson" initialSteps={defaults?.steps ?? []} />
        </div>
        <label className={`${labelClass} sm:col-span-3`}>
          Expected Result (overall)
          <textarea
            name="expectedResult"
            defaultValue={defaults?.expectedResult}
            required
            className={textareaClass}
          />
        </label>
        <label className={labelClass}>
          Priority
          <select name="priority" defaultValue={defaults?.priority ?? "MEDIUM"} required className={selectClass}>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label className={labelClass}>
          Test Type
          <select name="testType" defaultValue={defaults?.testType ?? ""} className={selectClass}>
            <option value="">—</option>
            <option value="POSITIVE">Positive</option>
            <option value="NEGATIVE">Negative</option>
            <option value="BOUNDARY">Boundary</option>
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
        <Button type="submit" className="self-end sm:col-span-3 sm:justify-self-start">
          {submitLabel}
        </Button>
      </form>
    </>
  );
}
