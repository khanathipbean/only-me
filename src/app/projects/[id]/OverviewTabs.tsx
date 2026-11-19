import { ViewTabs } from "@/components/ui/ViewTabs";
import { BarChartIcon, HomeIcon, PulseIcon, ShieldIcon } from "@/components/icons";

/**
 * The three readings of how a project is doing.
 *
 * They were three tabs of their own, and all three answer the same kind of
 * question — what is here, how far along is the round, which cases keep
 * going wrong — while changing nothing. One tab with a switcher says that;
 * three tabs said they were three different parts of the app.
 *
 * Nothing moved to make this: all three were already addresses under the
 * project, and the Overview is the project itself.
 *
 * What each reader may open is passed in, because the three are not one
 * permission: `reading.dashboard` is open to everybody, the other two are
 * not, so a DEV sees a single pill. Hiding a pill is not the guard — each
 * page checks for itself; this only stops the switcher offering what it
 * would then refuse.
 */
export function OverviewTabs({
  projectId,
  active,
  canSeeOverview,
  canSeeDashboard,
  canSeeProblems,
  canSeeAudit,
}: {
  projectId: string;
  active: "overview" | "dashboard" | "problems" | "audit";
  canSeeOverview: boolean;
  canSeeDashboard: boolean;
  canSeeProblems: boolean;
  canSeeAudit: boolean;
}) {
  const base = `/projects/${projectId}`;
  const tabs = [
    ...(canSeeOverview
      ? [
          /* "Summary", not "Overview": the nav tab above is already called
             Overview, and a pill repeating it made the pair read as the same
             control twice. This one names what the view actually is. */
          { label: "Summary", href: base, active: active === "overview", icon: HomeIcon },
        ]
      : []),
    ...(canSeeDashboard
      ? [
          {
            label: "Dashboard",
            href: `${base}/dashboard`,
            active: active === "dashboard",
            icon: BarChartIcon,
          },
        ]
      : []),
    ...(canSeeProblems
      ? [
          {
            label: "Problem Cases",
            href: `${base}/problem-cases`,
            active: active === "problems",
            icon: PulseIcon,
          },
        ]
      : []),
    /* Last, and it earns the place: the other three are opened to see how
       the project is doing, this one to settle a question about who changed
       what. Same job though — read the project, change nothing — which is
       what this switcher is for. */
    ...(canSeeAudit
      ? [
          {
            label: "Audit Trail",
            href: `${base}/audit-log`,
            active: active === "audit",
            icon: ShieldIcon,
          },
        ]
      : []),
  ];

  /* A switcher with one segment is not a switcher — it is a label that looks
     pressable. A DEV holds only the Dashboard, so they get nothing here
     rather than a single pill offering the page they are already on. */
  if (tabs.length < 2) {
    return null;
  }

  return (
    /* The wrapper is the whole point of this div. `ViewTabs` draws an
       `inline-flex` nav, which sizes itself to its segments — but these
       pages lay their contents out in a flex *column*, and a flex column
       stretches its children across the full width whatever their own
       display says. */
    <div>
      <ViewTabs label="Overview view" tabs={tabs} />
    </div>
  );
}
