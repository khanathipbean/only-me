/**
 * The red asterisk beside a mandatory field's label.
 *
 * Decorative on purpose: the control itself carries `required`, which is what
 * assistive technology announces. Leaving the asterisk audible would add a
 * "star" to every one of those labels without telling the listener anything
 * the field hasn't already said.
 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-red-500">
      *
    </span>
  );
}
