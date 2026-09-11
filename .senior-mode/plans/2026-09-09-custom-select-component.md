# Custom Select (replace native `<select>`) — Plan

Goal: full control over the dropdown's open option list — corners, spacing,
hover/selected states, brand highlight — which a native `<select>` never hands
over because the OS draws that popup.

Current vs desired (Diff):
- Now: 23 native `<select>` across 13 files, styled via `selectClass`. Only the
  closed control is ours; the open list is OS-drawn and unstylable.
- Want: one `Select` client component rendering a button + our own listbox, used
  everywhere, so every dropdown looks the same and matches the design tokens.

## Scope: 23 selects / 13 files

| Kind | Count | How it submits today |
|---|---|---|
| Server component, inside `FilterForm` | 7 | native change event → auto-apply to URL |
| Server component, inside a server-action `<form>` | 10 | native form POST (`name`/`defaultValue`) |
| Client component (DashboardView, ImportWizard, Pagination) | 6 | controlled `value`/`onChange` |

## Two regressions this introduces, and the mitigations

These are the reason this isn't a drop-in swap:

1. **`FilterForm` auto-apply breaks.** It applies immediately when
   `event.target.tagName === "SELECT"` and debounces otherwise, reading values
   via `new FormData(form)`. A custom component is a `<div>` + hidden input:
   FormData still sees the value, but a hidden input whose value is set from
   React state **emits no change event**, so `form onChange` never fires and the
   7 filter dropdowns silently stop filtering.
   → Mitigation: after committing a selection, set the hidden input through its
   native value setter and `dispatchEvent(new Event("change", {bubbles:true}))`.
   FilterForm must also stop keying off `tagName === "SELECT"` — switch it to a
   `data-` marker both the native and custom controls carry.

2. **`required` stops being enforced in the browser.** 4 selects use it
   (the three Move target pickers + ScenarioForm priority). Hidden inputs are
   **barred from constraint validation**, so an empty Move submit would no
   longer be blocked client-side.
   → Mitigation: the Move server actions already validate the target and
   redirect with `?moveError=`, so it degrades to a server round-trip with an
   inline error rather than a broken write. For the form selects, keep a real
   (visually hidden, `aria-hidden`) `<select>` as the submitted control so
   validation survives — heavier, but it's the only way to keep `required`.

## Out of scope / do NOT touch (Fence)
- `selectClass` / `.select-field` stay as they are until every call site is
  migrated, so the two can coexist during the change.
- Server-action form contracts: every `name` and submitted value stays byte-
  identical, and `parseStepsJson`/`FormData` reads must not change.
- The `Modal`/`ConfirmForm` `requestSubmit()` flow, which re-submits the form
  after confirming — the hidden input must be populated before that fires.

## Risks & unknowns
- Accessibility is the real cost: keyboard (Up/Down/Home/End/Enter/Space/Esc/
  typeahead), `role="combobox"` + `role="listbox"`/`option`, `aria-expanded`,
  `aria-activedescendant`, focus return on close, click-outside. Done badly this
  is strictly worse than the native control it replaces.
- Popup clipping: `html, body { overflow-x: hidden }` in globals.css makes body
  a scroll container on one axis, and a dropdown near the viewport edge can be
  clipped. May need fixed positioning rather than absolute.
- 23 migrations each convert `<option>` children into an `options` prop; a
  mistyped value silently changes what the form submits.

## Steps
1. `src/components/ui/Select.tsx` — the component: trigger button, listbox,
   full keyboard + ARIA, click-outside, controlled (`value` + `onChange`) and
   uncontrolled (`defaultValue` + hidden input) modes.
   Verify: `tsc`, `lint`, and a manual keyboard pass in the browser.
2. `FilterForm` — replace the `tagName === "SELECT"` check with a `data-`
   marker so both control types apply immediately. Verify: the 7 filter
   dropdowns still auto-apply (curl the URL each one produces).
3. Migrate the 6 client-component selects (controlled — lowest risk).
   Verify: Dashboard filters, ImportWizard duplicate resolution, Pagination.
4. Migrate the 7 `FilterForm` selects. Verify: each filter still narrows results.
5. Migrate the 10 server-action form selects, keeping `required` working via the
   hidden real `<select>`. Verify: create + edit + all three Move flows actually
   submit the right value end-to-end against Supabase.
6. Full check: `tsc`, `lint`, clean build, then a live pass over every migrated
   dropdown; re-run the import + move flows since those submit real data.
