"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type BulkSelection = {
  selected: Set<string>;
  toggle: (id: string, checked: boolean) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
};

const BulkSelectionContext = createContext<BulkSelection | null>(null);

/**
 * Holds which row ids are checked so a floating action bar elsewhere on the
 * page (outside the table) can show a live count and appear/disappear —
 * plain native checkboxes can't do that on their own without JS tracking
 * their state somewhere a sibling component can read it.
 */
export function BulkSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        selected,
        toggle,
        selectAll: (ids) => setSelected(new Set(ids)),
        clear: () => setSelected(new Set()),
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
