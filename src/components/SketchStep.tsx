"use client";

import { nanoid } from "nanoid";
import { useState } from "react";
import { fileToResizedDataUrl, postJson } from "@/lib/client";
import { useProject } from "@/lib/store";
import type { Facing, HousePlan } from "@/lib/types";

export function SketchStep() {
  const { brief, sketches, updateBrief, addSketch, removeSketch, setPlan, setStep, plan } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 6 - sketches.length)) {
      try {
        addSketch({ id: nanoid(8), name: file.name, dataUrl: await fileToResizedDataUrl(file) });
      } catch {
        setError(`Could not read ${file.name}`);
      }
    }
  };

  const analyze = async () => {
    setBusy(true);
    setError(null);
    try {
      const { plan } = await postJson<{ plan: HousePlan }>("/api/analyze", {
        brief,
        sketches: sketches.map((s) => s.dataUrl),
      });
      setPlan(plan);
      setStep("plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <section className="card">
        <h2 className="section-title">1. Share your sketch</h2>
        <p className="muted mb-4">
          Take a photo of your hand-drawn plan, one per floor. Labels in English or Hindi are fine.
        </p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 p-8 text-center hover:border-amber-500">
          <span className="text-3xl">📐</span>
          <span className="font-medium">Upload or take a photo</span>
          <span className="muted text-sm">JPG / PNG, up to 6 sketches</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </label>
        {sketches.length > 0 && (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sketches.map((s) => (
              <li key={s.id} className="relative overflow-hidden rounded-lg border border-stone-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.dataUrl} alt={s.name} className="aspect-[4/3] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeSketch(s.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-sm text-white"
                  aria-label={`Remove ${s.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="section-title">Tell us a little more</h2>
        <Field label="Project name">
          <input className="input" value={brief.title} placeholder="Sharma family home" onChange={(e) => updateBrief({ title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plot width (ft)">
            <input className="input" type="number" min={1} value={brief.plotWidth ?? ""} placeholder="30" onChange={(e) => updateBrief({ plotWidth: num(e.target.value) })} />
          </Field>
          <Field label="Plot depth (ft)">
            <input className="input" type="number" min={1} value={brief.plotDepth ?? ""} placeholder="40" onChange={(e) => updateBrief({ plotDepth: num(e.target.value) })} />
          </Field>
          <Field label="Road / entrance facing">
            <select className="input" value={brief.facing ?? ""} onChange={(e) => updateBrief({ facing: (e.target.value || null) as Facing | null })}>
              <option value="">Not sure</option>
              <option value="N">North</option>
              <option value="E">East</option>
              <option value="S">South</option>
              <option value="W">West</option>
            </select>
          </Field>
          <Field label="Floors">
            <input className="input" type="number" min={1} max={4} value={brief.floors ?? ""} placeholder="1" onChange={(e) => updateBrief({ floors: num(e.target.value) })} />
          </Field>
        </div>
        <Field label="Style you like">
          <input className="input" value={brief.style} placeholder="Modern, warm wood, white walls…" onChange={(e) => updateBrief({ style: e.target.value })} />
        </Field>
        <Field label="Anything else? (any language)">
          <textarea className="input min-h-24" value={brief.notes} placeholder="Kitchen should get morning sun, pooja room in north-east…" onChange={(e) => updateBrief({ notes: e.target.value })} />
        </Field>
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={busy || (sketches.length === 0 && !brief.notes.trim())} onClick={analyze}>
            {busy ? "Reading your sketch…" : "Understand my sketch →"}
          </button>
          {plan && (
            <button type="button" className="btn-secondary" onClick={() => setStep("plan")}>
              Back to current plan
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}
