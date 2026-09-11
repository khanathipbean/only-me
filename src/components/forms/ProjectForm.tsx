import { RequiredMark } from "@/components/forms/RequiredMark";
import { DialogCloseButton } from "@/components/ui/DialogCloseButton";
import { PROJECT_STATUS_OPTIONS } from "@/lib/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { inputClass, labelClass, textareaClass } from "@/lib/ui";
import type { ProjectStatus } from "@/generated/prisma/client";

export type ProjectFormDefaults = {
  code?: string;
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  startDate?: string;
  endDate?: string;
};

export function ProjectForm({
  action,
  defaults,
  submitLabel,
  error,
}: {
  action: (formData: FormData) => void;
  defaults?: ProjectFormDefaults;
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
        <label className={labelClass}>
          <span>
            Project Code
            <RequiredMark />
          </span>
          <input name="code" defaultValue={defaults?.code} required className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>
            Project Name
            <RequiredMark />
          </span>
          <input name="name" defaultValue={defaults?.name} required className={inputClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Description
          <textarea name="description" defaultValue={defaults?.description ?? ""} className={textareaClass} />
        </label>
        <label className={labelClass}>
          Start Date
          <input name="startDate" type="date" defaultValue={defaults?.startDate} className={inputClass} />
        </label>
        <label className={labelClass}>
          End Date
          <input name="endDate" type="date" defaultValue={defaults?.endDate} className={inputClass} />
        </label>
        <label className={labelClass}>
          <span>
            Status
            <RequiredMark />
          </span>
          <Select
            name="status"
            defaultValue={defaults?.status ?? "DRAFT"}
            options={PROJECT_STATUS_OPTIONS}
            required
            ariaLabel="Status"
          />
        </label>
        <div className="mt-2 flex flex-wrap justify-end gap-2 sm:col-span-2">
          <DialogCloseButton />
          <Button type="submit">{submitLabel}</Button>
        </div>
      </form>
    </>
  );
}
