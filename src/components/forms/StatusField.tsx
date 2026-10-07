import { Badge, workflowStatusTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { WORKFLOW_STATUS_OPTIONS } from "@/lib/enums";
import { labelClass } from "@/lib/ui";

/**
 * The Status field for a level that has levels beneath it.
 *
 * While the row has live children its status is not something anyone types:
 * it is every live child's status when they agree, and IN_PROGRESS when they
 * do not. Offering a field would be offering a choice the next edit anywhere
 * below would overrule, which reads as the app losing what someone entered.
 *
 * A row with no live children keeps the field. There is nothing to derive
 * from, and locking it would leave no way to say anything about the row at
 * all — a Scenario written this morning with no Test Groups yet.
 *
 * No hidden input in the derived case. The update functions fall back to the
 * row's current status when the form sends none, so leaving it out is the
 * accurate thing to send: the form has no opinion.
 */
export function StatusField({
  value,
  fromChildren,
  childNoun,
}: {
  value: string | undefined;
  /** The row has live children, so its status is theirs. */
  fromChildren: boolean;
  /** What those children are called, for the sentence under the value. */
  childNoun: string;
}) {
  if (!fromChildren) {
    return (
      <label className={labelClass}>
        Status
        <Select
          name="status"
          defaultValue={value ?? "DRAFT"}
          options={WORKFLOW_STATUS_OPTIONS}
          ariaLabel="Status"
        />
      </label>
    );
  }

  return (
    <div className={labelClass}>
      Status
      <span className="flex flex-wrap items-center gap-2">
        <Badge tone={workflowStatusTone(value ?? "DRAFT")}>
          {(value ?? "DRAFT").replace(/_/g, " ")}
        </Badge>
        <span className="text-xs font-normal text-muted">
          Follows the {childNoun} below — all the same, or In Progress.
        </span>
      </span>
    </div>
  );
}
