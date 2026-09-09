"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { ClearIcon } from "@/components/icons";
import { IconButton } from "@/components/ui/Button";

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
 * page it's rendered on). `showClear` hides the "Clear filters" button for
 * cases like that single search box, where there's nothing else to clear.
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
      className={`flex flex-wrap items-end gap-3 ${className}`}
    >
      {children}
      {showClear && (
        <IconButton type="button" variant="secondary" onClick={clear} aria-label="Clear filters" title="Clear filters">
          <ClearIcon />
        </IconButton>
      )}
    </form>
  );
}
