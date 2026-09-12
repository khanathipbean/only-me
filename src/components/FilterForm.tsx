"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { FilterOffIcon } from "@/components/icons";
import { fieldButtonClass } from "@/lib/ui";

const DEBOUNCE_MS = 400;

/**
 * Wraps a set of filter inputs/selects and applies them as a query string
 * automatically — selects and date pickers apply immediately on change,
 * text inputs are debounced so filtering doesn't fire on every keystroke.
 * Pressing Enter applies immediately, bypassing any pending debounce.
 * No submit button: this replaces the old "Filter" button.
 *
 * `action` overrides the destination path (defaults to the current page —
 * e.g. the global search box always targets `/search`, regardless of which
 * page it's rendered on).
 *
 * `showClear` decides whether the "Clear filters" button appears, and the
 * page passes it: only the page knows which of its query parameters are
 * filters. The URL also carries `error`, `editId`, `page` and the like, so
 * deciding here — from the query string or the field values — would offer to
 * clear filters when none are set.
 */
export function FilterForm({
  action,
  showClear = true,
  className = "",
  children,
}: {
  action?: string;
  showClear?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const target = action ?? pathname;
  const formRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  function apply() {
    if (!formRef.current) {
      return;
    }
    const formData = new FormData(formRef.current);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value) {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.push(query ? `${target}?${query}` : target, { scroll: false });
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    const field = event.target as HTMLInputElement;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (field.tagName === "SELECT" || field.type === "date" || field.type === "datetime-local") {
      apply();
    } else {
      debounceRef.current = setTimeout(apply, DEBOUNCE_MS);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    apply();
  }

  function clear() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    formRef.current?.reset();
    router.push(target, { scroll: false });
  }

  return (
    <form
      ref={formRef}
      onChange={handleChange}
      onSubmit={handleSubmit}
      // Below sm: an even grid (every field's column at least 8rem, however
      // many fit per row) instead of flex-wrap — flex-wrap breaks the row
      // wherever each field's own width happens to run out of room, which
      // read as ragged (three narrow fields on one line, two on the next,
      // for no reason a viewer could see). sm: and up reverts to flex-wrap,
      // unchanged from before — plenty of room there for one tidy row.
      className={`grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] items-end gap-3 sm:flex sm:flex-wrap ${className}`}
    >
      {children}
      {showClear && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear filters"
          title="Clear filters"
          className={fieldButtonClass}
        >
          <FilterOffIcon />
        </button>
      )}
    </form>
  );
}
