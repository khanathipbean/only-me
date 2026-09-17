# Toast coverage — Plan

Goal: a toast fires exactly when the result of an action is NOT visible on the
page the user lands on.
Current vs desired: create/delete already toast; archive, restore, duplicate and
every "move to another parent" redirect silently, and the row they changed has
left the screen → want those confirmed.

Out of scope / do NOT touch (Fence):
- rename/update where the new value shows in the row you land on — stays silent
- reorder ↑↓, set test result, open/close a run — the badge or position moves
- validation errors — they stay inline via `?error=`, never a toast
- ImportWizard — it already renders a succeeded/failed/skipped summary panel
- Test Case DETAIL archive/restore — an "Archived" badge sits on that page
- members — there is no "remove member" action; access changes show in the table

Risks: a server action may only close over serialisable values, so destination
names are looked up inside the action (getModuleById etc.), never captured from
the page's already-fetched lists.

## Steps
1. Archive/restore on the four list pages — modules, requirements, scenarios,
   test-groups — verify: row vanishes, toast names what happened.
2. Duplicate — scenarios, test-groups (copy may land on another page of the
   list), test case detail (you are now on the copy, which looks identical).
3. Moved to another parent — requirement→module, scenario→requirement,
   scenario→project, test-group→scenario, test-case→test-group. Toast names the
   destination, looked up server-side.
4. Runs — "Added N test cases" from the service's own count, and one for
   removing a case. Verify: adding nothing says so rather than nothing at all.
5. tsc + eslint + npm test, then check the toast copy reads as one short line.
