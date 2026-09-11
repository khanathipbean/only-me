import { RequiredMark } from "@/components/forms/RequiredMark";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { PRIORITY_OPTIONS, TEST_TYPE_OPTIONS, WORKFLOW_STATUS_OPTIONS } from "@/lib/enums";
import { Select } from "@/components/ui/Select";
import { TestStepEditor, type StepDraft } from "@/components/TestStepEditor";
import { Button } from "@/components/ui/Button";
import { inputClass, labelClass, textareaClass } from "@/lib/ui";
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
          <span>
            Test Case Name
            <RequiredMark />
          </span>
          <input name="name" defaultValue={defaults?.name} required className={inputClass} placeholder="e.g. Reject a password shorter than 8 characters" />
        </label>
        <label className={labelClass}>
          Condition
          <textarea name="condition" defaultValue={defaults?.condition ?? ""} className={textareaClass} placeholder="The situation being tested" />
        </label>
        <label className={labelClass}>
          Preconditions
          <textarea
            name="preconditions"
            placeholder="What must already be true before this case runs"
            defaultValue={defaults?.preconditions ?? ""}
            className={textareaClass}
          />
        </label>
        <label className={labelClass}>
          Test Data
          <textarea name="testData" defaultValue={defaults?.testData ?? ""} className={textareaClass} placeholder="Values this case needs — e.g. email: user@example.com" />
        </label>
        <div className="flex flex-col gap-1.5 sm:col-span-3">
          <span className="text-sm font-medium text-foreground">Test Steps</span>
          <TestStepEditor fieldName="stepsJson" initialSteps={defaults?.steps ?? []} />
        </div>
        <label className={`${labelClass} sm:col-span-3`}>
          <span>
            Expected Result (overall)
            <RequiredMark />
          </span>
          <textarea
            name="expectedResult"
            placeholder="What the system should do overall when this case passes"
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
          Test Type
          <Select
            name="testType"
            defaultValue={defaults?.testType ?? ""}
            options={TEST_TYPE_OPTIONS}
            ariaLabel="Test Type"
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
        <div className="mt-2 flex flex-wrap justify-end gap-2 sm:col-span-3">
          <DialogCloseButton />
          <Button type="submit">{submitLabel}</Button>
        </div>
      </form>
    </>
  );
}
