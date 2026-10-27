"use client";

import { useEffect, useState } from "react";
import { ModelStep } from "@/components/ModelStep";
import { PlanStep } from "@/components/PlanStep";
import { SketchStep } from "@/components/SketchStep";
import { VisualsStep } from "@/components/VisualsStep";
import { useProject, type Step } from "@/lib/store";

const STEPS: { id: Step; label: string }[] = [
  { id: "sketch", label: "Sketch" },
  { id: "plan", label: "Plan" },
  { id: "visuals", label: "Looks" },
  { id: "model", label: "3D" },
];

export function Studio() {
  const { step, plan, setStep, reset, brief } = useProject();
  const [hydrated, setHydrated] = useState(() => useProject.persist.hasHydrated());

  useEffect(() => useProject.persist.onFinishHydration(() => setHydrated(true)), []);

  if (!hydrated) {
    return <div className="p-10 text-center text-stone-500">Loading your project…</div>;
  }

  const activeStep = plan ? step : "sketch";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            3D-<span className="text-amber-600">architect</span>
          </h1>
          <p className="muted text-sm">From a rough sketch to a home everyone can picture.</p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Steps">
          {STEPS.map((s, i) => {
            const enabled = s.id === "sketch" || Boolean(plan);
            return (
              <button
                key={s.id}
                type="button"
                disabled={!enabled}
                onClick={() => setStep(s.id)}
                className={activeStep === s.id ? "chip-active" : "chip disabled:opacity-40"}
              >
                {i + 1}. {s.label}
              </button>
            );
          })}
          {(plan || brief.title) && (
            <button
              type="button"
              className="ml-2 text-sm text-stone-500 underline"
              onClick={() => confirm("Start a new project? This clears the current one.") && reset()}
            >
              New project
            </button>
          )}
        </nav>
      </header>

      {activeStep === "sketch" && <SketchStep />}
      {activeStep === "plan" && <PlanStep />}
      {activeStep === "visuals" && <VisualsStep />}
      {activeStep === "model" && <ModelStep />}
    </div>
  );
}
