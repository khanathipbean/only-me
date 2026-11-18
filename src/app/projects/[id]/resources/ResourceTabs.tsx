import { ViewTabs } from "@/components/ui/ViewTabs";
import { ClipboardListIcon, FileIcon, LinkIcon } from "@/components/icons";

/**
 * The four views of Resources: everything at once, then each kind on its own.
 *
 * Four addresses rather than one page with a query parameter. Each view has
 * its own filters, its own list and its own dialogs, and a reader who
 * bookmarks the Files list or opens it in another window should get the
 * Files list back — which is what `ViewTabs` is built out of links for. It
 * also means each page stayed the size it was.
 *
 * `canSeeFiles` is passed in rather than worked out here: `files.view` is
 * still its own capability, separate from `notes.view`, so somebody may hold
 * one and not the other. Hiding the pill is not the guard — the Files page
 * checks for itself, and the All view leaves file rows out for the same
 * reader. This only stops the menu offering a link that answers 404.
 */
export function ResourceTabs({
  projectId,
  active,
  canSeeFiles,
}: {
  projectId: string;
  active: "all" | "notes" | "files" | "links";
  canSeeFiles: boolean;
}) {
  const base = `/projects/${projectId}/resources`;
  return (
    /* The wrapper is the whole point of this div. `ViewTabs` draws an
       `inline-flex` nav, which sizes itself to its segments — but every page
       here lays its contents out in a flex *column*, and a flex column
       stretches its children across the full width whatever their own
       display says. Without it the control came out as a track the width of
       the page with the pills adrift at the left end. */
    <div>
      <ViewTabs
        label="Resources view"
        tabs={[
          { label: "All", href: base, active: active === "all" },
          {
            label: "Notes",
            href: `${base}/notes`,
            active: active === "notes",
            icon: ClipboardListIcon,
          },
          ...(canSeeFiles
            ? [
                {
                  label: "Files",
                  href: `${base}/files`,
                  active: active === "files",
                  icon: FileIcon,
                },
              ]
            : []),
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
