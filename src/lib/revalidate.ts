import { revalidatePath } from "next/cache";

/**
 * Throw away the client's cached copy of every route.
 *
 * A Server Action refreshes nothing by itself, and most actions here finish by
 * redirecting to the list the user is already looking at. The router answers a
 * navigation to the page you are already on out of its own cache, so the row
 * just archived — or deleted — was still sitting on screen afterwards, and
 * pressing the button again only wrote the same change a second time. Next's
 * own guide is explicit about it: call `revalidatePath` before `redirect` when
 * the page needs fresh data.
 *
 * `("/", "layout")` is the whole tree on purpose rather than one path. A change
 * at any level shows up in its parents too — a Module's Requirement count, the
 * Dashboard, every breadcrumb — and nothing in this app is statically cached,
 * so there is no expensive rebuild being thrown away here, only the client's
 * copy. Signing in and out go through it as well, so one account's pages can
 * never be served to the next.
 */
export function invalidateRouteCache() {
  revalidatePath("/", "layout");
}
