/**
 * The one place URLs for the Project > Module > Requirement > Scenario >
 * Test Group > Test Case hierarchy are assembled. Every level needs the ids
 * of all its ancestors, so hand-writing the template in each page, the search
 * results and the Dashboard tree is how they drift apart.
 */

export type HierarchyIds = {
  projectId: string;
  moduleId: string;
  requirementId: string;
  scenarioId?: string;
  testGroupId?: string;
  testCaseId?: string;
};

/**
 * A list page's own address, with the filters the reader currently has set.
 *
 * Every list page needs this and every one of them had written it out: build
 * a query string from whichever of its filters are set, then append it to the
 * path unless it is empty. Nine copies of eight lines, which is nine places to
 * fix when an action forgets to carry the reader's filters back — the bug that
 * sent somebody on page three of a filtered run back to page one of an
 * unfiltered one.
 *
 * `query` comes back too, because the pages that redirect on a validation
 * error reopen the same list with one extra parameter on it and need the rest
 * of the string to add to.
 *
 * Safe for a server action to use what this returns, which is the reason the
 * pages compute it in the component body: an action may close over strings,
 * and closing over a *function* instead made React give up encoding the
 * action altogether and render `action="javascript:throw …"`. This one is
 * imported rather than captured, so nothing closes over it.
 */
export function listHrefWithFilters(
  path: string,
  filters: Record<string, string | number | undefined>,
) {
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return { query, href: query ? `${path}?${query}` : path };
}

/**
 * The same list page, with the reader's filters, plus a message to show.
 *
 * Every page that validates a form needs this and every one of them wrote it
 * out, which is how six of the ten ended up dropping the filters they were
 * meant to carry — including one page where the row action got it right and
 * the create action beside it did not.
 *
 * Takes `query` as the string `listHrefWithFilters` already returned rather
 * than the filters themselves, because the caller is usually a server action:
 * it may close over strings, and the one time something closed over a
 * function instead React gave up encoding the action and rendered
 * `action="javascript:throw …"` on every row of the page.
 *
 * `extra` is for the parameters that are not filters but still have to
 * survive — which row to reopen, which of a page's several error slots this
 * message belongs in.
 */
export function errorHref(
  path: string,
  query: string,
  message: string,
  extra: Record<string, string | undefined> = {},
  errorParam = "error",
) {
  const params = new URLSearchParams(query);
  for (const [name, value] of Object.entries(extra)) {
    if (value) {
      params.set(name, value);
    }
  }
  params.set(errorParam, message);
  return `${path}?${params.toString()}`;
}

function projectHref(projectId: string) {
  return `/projects/${projectId}`;
}

export function modulesListHref(projectId: string) {
  return `${projectHref(projectId)}/modules`;
}

export function notesListHref(projectId: string) {
  return `${projectHref(projectId)}/notes`;
}

export function requirementsListHref(projectId: string, moduleId: string) {
  return `${modulesListHref(projectId)}/${moduleId}/requirements`;
}

export function scenariosListHref(
  projectId: string,
  moduleId: string,
  requirementId: string,
) {
  return `${requirementsListHref(projectId, moduleId)}/${requirementId}/scenarios`;
}

export function testGroupsListHref(ids: HierarchyIds & { scenarioId: string }) {
  return `${scenariosListHref(ids.projectId, ids.moduleId, ids.requirementId)}/${ids.scenarioId}/test-groups`;
}

export function testCasesListHref(
  ids: HierarchyIds & { scenarioId: string; testGroupId: string },
) {
  return `${testGroupsListHref(ids)}/${ids.testGroupId}/test-cases`;
}

export function testCaseHref(
  ids: HierarchyIds & { scenarioId: string; testGroupId: string; testCaseId: string },
) {
  return `${testCasesListHref(ids)}/${ids.testCaseId}`;
}
