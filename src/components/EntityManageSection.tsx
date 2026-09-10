import type { ReactNode } from "react";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TrashIcon } from "@/components/icons";
import { labelClass } from "@/lib/ui";

/**
 * Move / Duplicate / Archive / Restore / Delete for one entity, rendered
 * inside its Edit dialog.
 *
 * It is a sibling of the edit form, never a child: `ConfirmForm` renders a
 * `<form>`, and a form nested in another form is invalid HTML that browsers
 * silently drop — the buttons would simply do nothing.
 */
export function EntityManageSection({
  moveLabel,
  moveFieldName,
  moveOptions,
  movePlaceholder,
  moveAction,
  moveConfirm,
  moveError,
  duplicateAction,
  duplicateConfirm,
  archiveAction,
  archiveConfirm,
  restoreAction,
  restoreConfirm,
  deleteAction,
  deleteConfirm,
  isArchived,
  trailing,
}: {
  moveLabel: string;
  moveFieldName: string;
  moveOptions: { value: string; label: string }[];
  movePlaceholder: string;
  moveAction: (formData: FormData) => void;
  moveConfirm: string;
  moveError?: string;
  duplicateAction: (formData: FormData) => void;
  duplicateConfirm: string;
  archiveAction: (formData: FormData) => void;
  archiveConfirm: string;
  restoreAction: (formData: FormData) => void;
  restoreConfirm: string;
  deleteAction: (formData: FormData) => void;
  deleteConfirm: string;
  isArchived: boolean;
  /** Rendered at the right end of the button row — the edit form's Cancel and
   * Save live here so both sit on one line, which they can't do inside the
   * form itself while these actions are separate `<form>`s. */
  trailing?: ReactNode;
}) {
  return (
    <section className="mt-6 flex flex-col gap-4 border-t border-border pt-5">
      <h3 className="text-sm font-semibold text-foreground">Manage</h3>

      {moveError && (
        <p
          role="alert"
          className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300"
        >
          {moveError}
        </p>
      )}

      {moveOptions.length > 0 && (
        <ConfirmForm action={moveAction} confirmMessage={moveConfirm}>
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${labelClass} max-w-sm flex-1`}>
              {moveLabel}
              <Select
                name={moveFieldName}
                defaultValue=""
                required
                options={[{ value: "", label: movePlaceholder }, ...moveOptions]}
                ariaLabel={moveLabel}
              />
            </label>
            <Button type="submit" variant="secondary">
              Move
            </Button>
          </div>
        </ConfirmForm>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
        <ConfirmForm action={duplicateAction} confirmMessage={duplicateConfirm}>
          <Button type="submit" variant="secondary">
            Duplicate
          </Button>
        </ConfirmForm>

        {isArchived ? (
          <ConfirmForm action={restoreAction} confirmMessage={restoreConfirm}>
            <Button type="submit" variant="secondary">
              Restore
            </Button>
          </ConfirmForm>
        ) : (
          <ConfirmForm action={archiveAction} confirmMessage={archiveConfirm}>
            <Button type="submit" variant="secondary">
              Archive
            </Button>
          </ConfirmForm>
        )}

        <ConfirmForm action={deleteAction} confirmMessage={deleteConfirm} variant="danger">
          <IconButton
            type="submit"
            variant="danger"
            iconSize="lg"
            aria-label="Delete"
            title="Delete"
          >
            <TrashIcon />
          </IconButton>
        </ConfirmForm>
        </div>

        {trailing && <div className="flex flex-wrap items-center gap-2">{trailing}</div>}
      </div>
    </section>
  );
}
