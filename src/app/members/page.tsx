import { redirect } from "next/navigation";

/**
 * Where the Members page used to live.
 *
 * It moved under Settings when that section arrived, and this stays behind
 * because the old address is in people's bookmarks, in the links on every
 * notification written before the move, and in whatever anybody pasted into
 * a chat. A 404 on an address that worked yesterday is a bug to the person
 * who kept it.
 *
 * `redirect`, not `permanentRedirect`: a 308 is cached by the browser
 * forever, and an address that cannot be taken back is a poor trade for
 * saving one hop.
 */
export default async function MembersRedirect({
  searchParams,
}: PageProps<"/members">) {
  /* The tab and the row a toast points at travel with it — landing on the
   * People tab when the link said "activity" loses what the link was for. */
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") {
      query.set(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    }
  }
  const search = query.toString();
  redirect(search ? `/settings/members?${search}` : "/settings/members");
}
