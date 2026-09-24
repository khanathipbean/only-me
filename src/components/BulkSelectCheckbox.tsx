"use client";

import { useBulkSelection } from "@/components/BulkSelectionProvider";

/** A row's checkbox. `form` associates it with a `<form>` it isn't nested
 *  inside — see `ConfirmForm`'s `id` prop — so it can sit in a table cell
 *  while the submit button lives in a floating bar elsewhere on the page. */
export function BulkSelectCheckbox({
  id,
  label,
  formId,
  name,
}: {
  id: string;
  label: string;
  formId: string;
  name: string;
}) {
  const { active, selected, toggle } = useBulkSelection();
  if (!active) {
    return null;
  }
  return (
    <input
      type="checkbox"
      name={name}
      value={id}
      form={formId}
      checked={selected.has(id)}
      onChange={(event) => toggle(id, event.target.checked)}
      aria-label={`Select ${label}`}
    />
  );
}
