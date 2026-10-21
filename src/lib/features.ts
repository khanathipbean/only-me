/**
 * Switches for parts of the app that exist in the data model but have no way
 * in yet. Off means hidden, not removed: the column, the service function and
 * the route all stay, so turning one back on is a one-line change here plus
 * whatever UI is needed to set the value.
 */

/**
 * Assigning a Test Case to a person.
 *
 * Off for as long as nothing in the UI could set one: every case read
 * "Unassigned" forever, and a dashboard chart of a single grey bar said
 * nothing. The Test Run page can now hand a case over — a control on the row
 * and one in the selection panel — so the places that show an assignee have
 * something to show.
 */
export const ASSIGNEE_ENABLED = true;
