"use client";

import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/client";
import type { PlanIssue } from "@/lib/planCheck";
import { useProject } from "@/lib/store";
import type { ClarifyAnswer, ClarifyingQuestion, HousePlan } from "@/lib/types";

const OTHER = "__other__";

type Props = { onHighlight: (roomId: string | null) => void };

// AI reviews the plan against the sketch and asks about anything ambiguous instead of guessing.
export function ClarifyPanel({ onHighlight }: Props) {
  const { plan, brief, sketches, planRevision, review, setReview, applyRevision } = useProject();
  const [loading, setLoading] = useState<"review" | "revise" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const requested = useRef<number | null>(null);

  const runReview = async () => {
    const state = useProject.getState();
    if (!state.plan) return;
    requested.current = state.planRevision;
    setLoading("review");
    setError(null);
    try {
      const result = await postJson<{ questions: ClarifyingQuestion[]; issues: PlanIssue[] }>("/api/review", {
        brief: state.brief,
        plan: state.plan,
        sketches: state.sketches.map((s) => s.dataUrl),
      });
      setReview({ revision: state.planRevision, questions: result.questions, issues: result.issues, history: state.review?.history ?? [] });
      setChoices({});
      setOtherText({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setLoading(null);
    }
  };

  // Review every new AI-produced plan once (manual edits don't trigger it).
  useEffect(() => {
    if (plan && review?.revision !== planRevision && requested.current !== planRevision) {
      void runReview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planRevision, review?.revision, plan]);

  if (!plan) return null;
  const questions = review?.revision === planRevision ? review.questions : [];

  const answerFor = (q: ClarifyingQuestion) => {
    const choice = choices[q.id];
    if (!choice) return null;
    if (choice !== OTHER) return choice;
    const text = otherText[q.id]?.trim();
    return text ? `Other: ${text}` : null;
  };
  const answered: ClarifyAnswer[] = questions.flatMap((q) => {
    const answer = answerFor(q);
    return answer ? [{ questionId: q.id, question: q.question, answer }] : [];
  });

  const submit = async () => {
    if (!answered.length) return;
    setLoading("revise");
    setError(null);
    try {
      const result = await postJson<{ plan: HousePlan }>("/api/revise", {
        brief,
        plan,
        sketches: sketches.map((s) => s.dataUrl),
        answers: answered,
      });
      applyRevision(result.plan, answered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="section-title">A few questions about your sketch</h2>
        <button type="button" className="chip" disabled={loading !== null} onClick={runReview}>
          Re-check
        </button>
      </div>

      {loading === "review" && <p className="muted animate-pulse text-sm">Checking the plan against your sketch…</p>}
      {loading === "revise" && <p className="muted animate-pulse text-sm">Updating the plan with your answers…</p>}
      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {!loading && review?.revision === planRevision && questions.length === 0 && (
        <p className="text-sm text-emerald-700">✓ Everything on the plan matches your sketch. Nothing to clarify.</p>
      )}

      {!loading && questions.length > 0 && (
        <div className="space-y-4">
          {questions.map((q, index) => (
            <div
              key={q.id}
              className="rounded-xl border border-stone-200 p-3"
              onMouseEnter={() => onHighlight(q.roomIds[0] ?? null)}
              onMouseLeave={() => onHighlight(null)}
            >
              <p className="font-medium">
                {index + 1}. {q.question}
              </p>
              <p className="muted mb-2 text-xs">{q.context}</p>
              <div className="flex flex-wrap gap-2">
                {[...q.options, OTHER].map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={choices[q.id] === option ? "chip-active" : "chip"}
                    onClick={() => setChoices((c) => ({ ...c, [q.id]: option }))}
                  >
                    {option === OTHER ? "Other…" : option}
                  </button>
                ))}
              </div>
              {choices[q.id] === OTHER && (
                <input
                  className="input mt-2"
                  placeholder="Describe it in your own words"
                  value={otherText[q.id] ?? ""}
                  onChange={(e) => setOtherText((t) => ({ ...t, [q.id]: e.target.value }))}
                />
              )}
            </div>
          ))}
          <button type="button" className="btn-primary" disabled={!answered.length} onClick={submit}>
            Update plan with {answered.length} answer{answered.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {review && review.history.length > 0 && (
        <details className="mt-4 text-sm text-stone-600">
          <summary className="cursor-pointer">Answers applied so far ({review.history.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {review.history.map((h, i) => (
              <li key={`${h.questionId}-${i}`}>
                {h.question} → <strong>{h.answer}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
