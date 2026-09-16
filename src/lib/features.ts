/**
 * Switches for parts of the app that exist in the data model but have no way
 * in yet. Off means hidden, not removed: the column, the service function and
 * the route all stay, so turning one back on is a one-line change here plus
 * whatever UI is needed to set the value.
 */

/**
 * Assigning a Test Case to a person. `TestCase.assigneeId`,
 * `updateAssignee()` and `PATCH /api/test-cases/:id/assignee` all still work,
 * but nothing in the UI can set one — so every Test Case reads "Unassigned"
 * forever, and a dashboard chart of one grey bar says nothing. Hidden until
 * there is a way to actually assign someone.
 */
export const ASSIGNEE_ENABLED = false;
