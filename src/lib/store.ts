"use client";

import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { ClarifyAnswer, ClarifyingQuestion, HousePlan, ImageVariant, PartVisuals, ProjectBrief, Sam3dAsset, Sketch } from "./types";
import type { PlanIssue } from "./planCheck";

export type PlanReview = {
  revision: number;
  questions: ClarifyingQuestion[];
  issues: PlanIssue[];
  // Q&A already applied to the plan, newest last, so the history is visible.
  history: ClarifyAnswer[];
};

export type Step = "sketch" | "plan" | "visuals" | "model";

type ProjectState = {
  step: Step;
  brief: ProjectBrief;
  sketches: Sketch[];
  plan: HousePlan | null;
  visuals: Record<string, PartVisuals>;
  sam3d: Record<string, Sam3dAsset>;
  // Bumped whenever the AI produces a new plan, so the review re-runs for it (manual edits don't bump it).
  planRevision: number;
  review: PlanReview | null;
  setStep: (step: Step) => void;
  updateBrief: (patch: Partial<ProjectBrief>) => void;
  addSketch: (sketch: Sketch) => void;
  removeSketch: (id: string) => void;
  setPlan: (plan: HousePlan | null) => void;
  updatePlan: (plan: HousePlan) => void;
  applyRevision: (plan: HousePlan, answers: ClarifyAnswer[]) => void;
  setReview: (review: PlanReview) => void;
  addVariant: (partId: string, variant: ImageVariant) => void;
  selectVariant: (partId: string, variantId: string) => void;
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
      planRevision: 0,
      review: null,
      setStep: (step) => setState({ step }),
      updateBrief: (patch) => setState((s) => ({ brief: { ...s.brief, ...patch } })),
      addSketch: (sketch) => setState((s) => ({ sketches: [...s.sketches, sketch] })),
      removeSketch: (id) => setState((s) => ({ sketches: s.sketches.filter((k) => k.id !== id) })),
      setPlan: (plan) => setState((s) => ({ plan, visuals: {}, sam3d: {}, planRevision: s.planRevision + 1, review: null })),
      updatePlan: (plan) => setState({ plan }),
      applyRevision: (plan, answers) =>
        setState((s) => ({
          plan,
          planRevision: s.planRevision + 1,
          review: s.review ? { ...s.review, questions: [], history: [...s.review.history, ...answers] } : null,
        })),
      setReview: (review) => setState({ review }),
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
      setSam3d: (asset) => setState((s) => ({ sam3d: { ...s.sam3d, [asset.partId]: asset } })),
      reset: () => setState({ step: "sketch", brief: emptyBrief, sketches: [], plan: null, visuals: {}, sam3d: {}, planRevision: 0, review: null }),
    }),
    {
      name: "3d-architect-project",
      storage: createJSONStorage(() => idbStorage),
      partialize: ({ step, brief, sketches, plan, visuals, sam3d, planRevision, review }) => ({
        step,
        brief,
        sketches,
        plan,
        visuals,
        sam3d,
        planRevision,
        review,
      }),
    },
  ),
);
