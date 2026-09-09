"use client";

import { useState } from "react";
import { inputClass } from "@/lib/ui";

export type StepDraft = { step: string; expectedResult: string };

/** Client-side dynamic Test Step list: add/remove/reorder, submitted as one hidden JSON field. */
export function TestStepEditor({
  fieldName,
  initialSteps,
}: {
  fieldName: string;
  initialSteps: StepDraft[];
}) {
  const [steps, setSteps] = useState<StepDraft[]>(
    initialSteps.length > 0 ? initialSteps : [{ step: "", expectedResult: "" }],
  );

  function update(index: number, field: keyof StepDraft, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function add() {
    setSteps((prev) => [...prev, { step: "", expectedResult: "" }]);
  }

  function remove(index: number) {
    setSteps((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function move(index: number, delta: -1 | 1) {
    setSteps((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) {
        return prev;
      }
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={fieldName} value={JSON.stringify(steps)} />
      {steps.map((s, index) => (
        <div
          key={index}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2"
        >
          <span className="w-5 shrink-0 text-center text-xs text-muted">{index + 1}</span>
          <input
            aria-label={`Step ${index + 1} text`}
            placeholder="Step"
            value={s.step}
            onChange={(e) => update(index, "step", e.target.value)}
            className={`${inputClass} flex-1 min-w-40`}
          />
          <input
            aria-label={`Step ${index + 1} expected result`}
            placeholder="Expected result"
            value={s.expectedResult}
            onChange={(e) => update(index, "expectedResult", e.target.value)}
            className={`${inputClass} flex-1 min-w-40`}
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-foreground disabled:opacity-40"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === steps.length - 1}
              className="rounded-md border border-border px-2 py-1 text-sm text-muted hover:text-foreground disabled:opacity-40"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={steps.length === 1}
              className="rounded-md border border-border px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-900/20"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="self-start rounded-md border border-dashed border-border px-3 py-1.5 text-sm text-muted hover:border-brand hover:text-brand"
      >
        + Add Step
      </button>
    </div>
  );
}
