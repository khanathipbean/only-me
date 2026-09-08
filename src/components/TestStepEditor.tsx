"use client";

import { useState } from "react";

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
    <div>
      <input type="hidden" name={fieldName} value={JSON.stringify(steps)} />
      {steps.map((s, index) => (
        <div key={index}>
          <input
            aria-label={`Step ${index + 1} text`}
            placeholder="Step"
            value={s.step}
            onChange={(e) => update(index, "step", e.target.value)}
          />
          <input
            aria-label={`Step ${index + 1} expected result`}
            placeholder="Expected result"
            value={s.expectedResult}
            onChange={(e) => update(index, "expectedResult", e.target.value)}
          />
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
            ↑
          </button>
          <button
            type="button"
            onClick={() => move(index, 1)}
            disabled={index === steps.length - 1}
          >
            ↓
          </button>
          <button type="button" onClick={() => remove(index)} disabled={steps.length === 1}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={add}>
        + Add Step
      </button>
    </div>
  );
}
