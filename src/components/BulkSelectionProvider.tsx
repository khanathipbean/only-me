"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

type BulkSelection = {
  /** Off until someone presses Select: the checkbox column isn't rendered and
   *  the action bar can't appear. A list is read far more often than it is
   *  acted on in bulk, and a column of checkboxes that is always there costs
   *  every reader width for something used occasionally. */
  active: boolean;
  toggleMode: () => void;
  selected: Set<string>;
  toggle: (id: string, checked: boolean) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  /** True once the reader has asked for every row the filter matches, not
   *  only the page in front of them. */
  allMatching: boolean;
  setAllMatching: (on: boolean) => void;
};

const BulkSelectionContext = createContext<BulkSelection | null>(null);

/**
 * Holds which row ids are checked so a floating action bar elsewhere on the
 * page (outside the table) can show a live count and appear/disappear —
 * plain native checkboxes can't do that on their own without JS tracking
 * their state somewhere a sibling component can read it.
 */
export function BulkSelectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /* Reaching past this page is a second, deliberate step, never a side effect
   * of ticking the header box: Archive is one press away, and the rows it
   * would reach are not on screen to be looked at. */
  const [allMatching, setAllMatching] = useState(false);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  return (
    <BulkSelectionContext.Provider
      value={{
        active,
        /* Leaving the mode drops what was ticked: coming back to a selection
         * nobody remembers making is how the wrong rows get archived. */
        toggleMode: () =>
          setActive((on) => {
            if (on) {
              setSelected(new Set());
              setAllMatching(false);
            }
            return !on;
          }),
        selected,
        toggle: (id, checked) => {
          /* Any change to the ticks is a narrower choice than "everything
           * that matches", so the wider scope stops applying. */
          setAllMatching(false);
          toggle(id, checked);
        },
        selectAll: (ids) => {
          setAllMatching(false);
          setSelected(new Set(ids));
        },
        clear: () => {
          setAllMatching(false);
          setSelected(new Set());
        },
        allMatching,
        setAllMatching,
      }}
    >
      {children}
    </BulkSelectionContext.Provider>
  );
}

export function useBulkSelection() {
  const context = useContext(BulkSelectionContext);
  if (!context) {
    throw new Error("useBulkSelection must be used inside a BulkSelectionProvider");
  }
  return context;
}

/** The button that turns the mode on and off. Lives wherever the page keeps
 *  its own actions, not above the table, so the list doesn't gain a strip
 *  that is empty most of the time. */
export function BulkSelectToggle() {
  const { active, toggleMode } = useBulkSelection();
  return (
    <Button type="button" variant="secondary" onClick={toggleMode}>
      {active ? "Cancel selection" : "Select"}
    </Button>
  );
}
