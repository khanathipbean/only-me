import { Badge, workflowStatusTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { WORKFLOW_STATUS_OPTIONS } from "@/lib/enums";
import { labelClass } from "@/lib/ui";

/**
 * The Status field, shown as a value instead of a choice wherever the status
 * is worked out rather than typed.
 *
 * Two different things derive it and the field does not care which: a parent
 * takes it from the live rows beneath it, and a Test Case takes it from the
 * result a round gave it. Either way, offering a field would be offering a
 * choice the next edit would overrule, which reads as the app losing what
 * someone entered. The caller passes the sentence saying which, because only
 * the caller knows.
 *
 * Nothing derived keeps the field. A Scenario written this morning with no
 * Test Groups, or a case no round has reached, has nothing to derive from,
 * and locking it would leave no way to say anything about the row at all.
 *
 * No hidden input in the derived case. The update functions fall back to the
 * row's current status when the form sends none, so leaving it out is the
 * accurate thing to send: the form has no opinion.
 */
export function StatusField({
  value,
  derivedFrom,
}: {
  value: string | undefined;
  /** Why the status is not editable, as a sentence. Absent means it is. */
  derivedFrom?: string;
}) {
  if (!derivedFrom) {
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
      {/* The reason on its own line rather than beside the badge: in a form
          column it is a sentence, and a sentence set next to a badge wraps
          into fragments that read as broken rather than as prose. */}
      <span className="flex flex-col items-start gap-1.5">
        <Badge tone={workflowStatusTone(value ?? "DRAFT")}>
          {(value ?? "DRAFT").replace(/_/g, " ")}
        </Badge>
        <span className="text-xs font-normal text-muted">{derivedFrom}</span>
      </span>
    </div>
  );
}
