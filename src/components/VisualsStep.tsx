"use client";

import { nanoid } from "nanoid";
import { useState } from "react";
import { postJson } from "@/lib/client";
import { useProject } from "@/lib/store";
import type { ImageVariant, VisualPart } from "@/lib/types";

const VARIANTS_PER_RUN = 2;
const PARALLEL_PARTS = 2;

type RenderResult = { dataUrl: string; responseId: string | null };

export function VisualsStep() {
  const { plan, visuals, setStep } = useProject();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  if (!plan) return null;

  const chosen = Object.values(visuals).filter((v) => v.selectedId).length;
  const mark = (partId: string, isBusy: boolean, error: string | null = null) => {
    setBusy((b) => ({ ...b, [partId]: isBusy }));
    setErrors((e) => ({ ...e, [partId]: error }));
  };

  const generate = async (part: VisualPart) => {
    // Read fresh state: this may run after earlier generations have added variants.
    const { plan: current, brief, sketches, visuals: latest, addVariant } = useProject.getState();
    if (!current) return;
    mark(part.id, true);
    const offset = latest[part.id]?.variants.length ?? 0;
    const results = await Promise.allSettled(
      Array.from({ length: VARIANTS_PER_RUN }, (_, i) =>
        postJson<RenderResult>("/api/render", {
          mode: "generate",
          plan: current,
          partId: part.id,
          style: brief.style,
          variantIndex: offset + i,
          sketch: sketches[0]?.dataUrl ?? null,
        }),
      ),
    );
    for (const r of results) {
      if (r.status === "fulfilled") addVariant(part.id, toVariant(r.value, ""));
    }
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    mark(part.id, false, failed ? errorText(failed.reason) : null);
  };

  const refine = async (part: VisualPart, variant: ImageVariant, instruction: string) => {
    const { addVariant, selectVariant } = useProject.getState();
    mark(part.id, true);
    try {
      const result = await postJson<RenderResult>("/api/render", {
        mode: "refine",
        // Mock variants have no server-side conversation to continue.
        previousResponseId: variant.responseId ?? "mock",
        instruction,
        title: part.title,
      });
      const next = toVariant(result, instruction);
      addVariant(part.id, next);
      selectVariant(part.id, next.id);
      mark(part.id, false);
      return true;
    } catch (e) {
      mark(part.id, false, errorText(e));
      return false;
    }
  };

  const generateAll = async () => {
    const queue = plan.parts.filter((p) => !visuals[p.id]?.variants.length && !busy[p.id]);
    const worker = async () => {
      for (let part = queue.shift(); part; part = queue.shift()) await generate(part);
    };
    await Promise.all(Array.from({ length: PARALLEL_PARTS }, worker));
  };

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">3. See your home, part by part</h2>
          <p className="muted text-sm">
            Generate a few looks for each part, pick the one you like, or ask for changes in your own words.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={generateAll}>
            Generate all parts
          </button>
          <button type="button" className="btn-secondary" onClick={() => setStep("model")}>
            Still hard to picture? Open 3D
          </button>
          <button type="button" className="btn-primary" disabled={chosen === 0} onClick={() => setStep("model")}>
            Build 3D from {chosen} chosen →
          </button>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {plan.parts.map((part) => (
          <PartCard
            key={part.id}
            part={part}
            busy={Boolean(busy[part.id])}
            error={errors[part.id] ?? null}
            onGenerate={() => generate(part)}
            onRefine={(variant, text) => refine(part, variant, text)}
          />
        ))}
      </div>
    </div>
  );
}

type PartCardProps = {
  part: VisualPart;
  busy: boolean;
  error: string | null;
  onGenerate: () => void;
  onRefine: (variant: ImageVariant, instruction: string) => Promise<boolean>;
};

function PartCard({ part, busy, error, onGenerate, onRefine }: PartCardProps) {
  const entry = useProject((s) => s.visuals[part.id]);
  const selectVariant = useProject((s) => s.selectVariant);
  const [instruction, setInstruction] = useState("");
  const selected = entry?.variants.find((v) => v.id === entry.selectedId) ?? null;

  const submitRefine = async () => {
    if (!selected || !instruction.trim() || busy) return;
    if (await onRefine(selected, instruction.trim())) setInstruction("");
  };

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{part.title}</h3>
          <p className="muted line-clamp-2 text-xs">{part.prompt}</p>
        </div>
        <button type="button" className="btn-secondary shrink-0" disabled={busy} onClick={onGenerate}>
          {busy ? "Working…" : entry?.variants.length ? "More looks" : "Generate"}
        </button>
      </div>

      {entry?.variants.length ? (
        <div className="grid grid-cols-2 gap-2">
          {entry.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => selectVariant(part.id, v.id)}
              className={`relative overflow-hidden rounded-lg border-2 ${v.id === entry.selectedId ? "border-amber-500 ring-2 ring-amber-300" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.dataUrl} alt={`${part.title} option`} className="aspect-[3/2] w-full object-cover" />
              {v.instruction && (
                <span className="absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1 text-left text-xs text-white">
                  “{v.instruction}”
                </span>
              )}
              {v.id === entry.selectedId && (
                <span className="absolute right-1 top-1 rounded-full bg-amber-500 px-2 text-xs font-semibold text-white">Chosen</span>
              )}
            </button>
          ))}
          {busy && <div className="aspect-[3/2] animate-pulse rounded-lg bg-stone-200" />}
        </div>
      ) : (
        <div className={`flex aspect-[3/1] items-center justify-center rounded-lg bg-stone-100 text-sm text-stone-500 ${busy ? "animate-pulse" : ""}`}>
          {busy ? "Imagining your space…" : "No images yet"}
        </div>
      )}

      {selected && (
        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            value={instruction}
            placeholder="e.g. lighter walls, add a window seat, wooden ceiling"
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitRefine()}
          />
          <button type="button" className="btn-secondary" disabled={busy || !instruction.trim()} onClick={submitRefine}>
            Change
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}

function toVariant(result: RenderResult, instruction: string): ImageVariant {
  return { id: nanoid(8), dataUrl: result.dataUrl, responseId: result.responseId, instruction };
}

function errorText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
