import { ViewTabs } from "@/components/ui/ViewTabs";
import { ClipboardListIcon, LinkIcon } from "@/components/icons";

/**
 * The two halves of Resources: what the team wrote down, and where the rest
 * of it lives.
 *
 * Two addresses rather than one page with a query parameter. Each view has
 * its own filters, its own list and its own dialogs, and a reader who
 * bookmarks the Links list or opens it in another window should get the Links
 * list back — which is the reason `ViewTabs` is built out of links in the
 * first place. It also keeps the Notes page the size it was.
 *
 * One component rather than the same four lines on both pages: a switcher
 * where the two sides disagree about what the other is called is the kind of
 * thing nobody notices until it is wrong in a screenshot.
 */
export function ResourceTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: "notes" | "links";
}) {
  const base = `/projects/${projectId}/notes`;
  return (
    /* The wrapper is the whole point of this div. `ViewTabs` draws an
       `inline-flex` nav, which sizes itself to its two segments — but both
       pages lay their contents out in a flex *column*, and a flex column
       stretches its children across the full width whatever their own
       display says. The control came out as a track the width of the page
       with two pills adrift at the left end. My Work never showed this
       because it puts the same control in a row beside its filter. */
    <div>
      <ViewTabs
        label="Resources view"
        tabs={[
          { label: "Notes", href: base, active: active === "notes", icon: ClipboardListIcon },
          {
            label: "Links",
            href: `${base}/links`,
            active: active === "links",
            icon: LinkIcon,
          },
        ]}
      />
    </div>
  );
}
