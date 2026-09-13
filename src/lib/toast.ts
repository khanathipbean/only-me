/**
 * Appends a one-shot toast message to a redirect target. `ToastListener`
 * (mounted once in the root layout) reads it back off the URL after the
 * redirect lands, shows it, then strips it — the same "carry it through the
 * redirect's query string" trick every validation `error` already uses, just
 * for a success message instead of a failure one.
 */
export function withToast(href: string, message: string): string {
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("toast", message);
  return `${path}?${params.toString()}`;
}
