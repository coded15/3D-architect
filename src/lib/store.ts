"use client";

import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { HousePlan, ImageVariant, PartVisuals, ProjectBrief, Sam3dAsset, Sketch } from "./types";

export type Step = "sketch" | "plan" | "visuals" | "model";

type ProjectState = {
  step: Step;
  brief: ProjectBrief;
  sketches: Sketch[];
  plan: HousePlan | null;
  visuals: Record<string, PartVisuals>;
  sam3d: Record<string, Sam3dAsset>;
  setStep: (step: Step) => void;
  updateBrief: (patch: Partial<ProjectBrief>) => void;
  addSketch: (sketch: Sketch) => void;
  removeSketch: (id: string) => void;
  setPlan: (plan: HousePlan | null) => void;
  updatePlan: (plan: HousePlan) => void;
  addVariant: (partId: string, variant: ImageVariant) => void;
  selectVariant: (partId: string, variantId: string) => void;
  clearVariants: (partId: string) => void;
  setSam3d: (asset: Sam3dAsset) => void;
  reset: () => void;
};

const emptyBrief: ProjectBrief = {
  title: "",
  plotWidth: null,
  plotDepth: null,
  facing: null,
  floors: null,
  notes: "",
  style: "",
};

// Images are stored as data URLs, which quickly exceed localStorage limits, so persist to IndexedDB.
const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: (name, value) => set(name, value),
  removeItem: (name) => del(name),
};

export const useProject = create<ProjectState>()(
  persist(
    (setState) => ({
      step: "sketch",
      brief: emptyBrief,
      sketches: [],
      plan: null,
      visuals: {},
      sam3d: {},
      setStep: (step) => setState({ step }),
      updateBrief: (patch) => setState((s) => ({ brief: { ...s.brief, ...patch } })),
      addSketch: (sketch) => setState((s) => ({ sketches: [...s.sketches, sketch] })),
      removeSketch: (id) => setState((s) => ({ sketches: s.sketches.filter((k) => k.id !== id) })),
      setPlan: (plan) => setState({ plan, visuals: {}, sam3d: {} }),
      updatePlan: (plan) => setState({ plan }),
      addVariant: (partId, variant) =>
        setState((s) => {
          const current = s.visuals[partId] ?? { partId, variants: [], selectedId: null };
          return {
            visuals: {
              ...s.visuals,
              [partId]: { ...current, variants: [...current.variants, variant] },
            },
          };
        }),
      selectVariant: (partId, variantId) =>
        setState((s) => {
          const current = s.visuals[partId];
          if (!current) return {};
          const selectedId = current.selectedId === variantId ? null : variantId;
          return { visuals: { ...s.visuals, [partId]: { ...current, selectedId } } };
        }),
      clearVariants: (partId) =>
        setState((s) => {
          const { [partId]: _removed, ...rest } = s.visuals;
          return { visuals: rest };
        }),
      setSam3d: (asset) => setState((s) => ({ sam3d: { ...s.sam3d, [asset.partId]: asset } })),
      reset: () => setState({ step: "sketch", brief: emptyBrief, sketches: [], plan: null, visuals: {}, sam3d: {} }),
    }),
    {
      name: "griha3d-project",
      storage: createJSONStorage(() => idbStorage),
      partialize: ({ step, brief, sketches, plan, visuals, sam3d }) => ({ step, brief, sketches, plan, visuals, sam3d }),
    },
  ),
);
