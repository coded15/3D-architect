"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { postJson } from "@/lib/client";
import { STAGES } from "@/lib/house3d";
import { paletteFromImage, type Palette } from "@/lib/palette";
import { useProject } from "@/lib/store";
import type { ImageVariant, VisualPart } from "@/lib/types";

// three.js needs the browser; load the canvases on the client only.
const House3D = dynamic(() => import("@/components/House3D").then((m) => m.House3D), { ssr: false });
const GlbViewer = dynamic(() => import("@/components/GlbViewer").then((m) => m.GlbViewer), { ssr: false });

type Chosen = { part: VisualPart; variant: ImageVariant };

export function ModelStep() {
  const { plan, visuals, sam3d, setSam3d, setStep } = useProject();
  const [stage, setStage] = useState(STAGES.length - 1);
  const [maxFloor, setMaxFloor] = useState(0);
  const [cutRoof, setCutRoof] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [palettes, setPalettes] = useState<Record<string, Palette>>({});
  const [exterior, setExterior] = useState<Palette | null>(null);
  const [sam3dEnabled, setSam3dEnabled] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [sam3dError, setSam3dError] = useState<string | null>(null);

  const chosen: Chosen[] = useMemo(() => {
    if (!plan) return [];
    return plan.parts.flatMap((part) => {
      const entry = visuals[part.id];
      const variant = entry?.variants.find((v) => v.id === entry.selectedId);
      return variant ? [{ part, variant }] : [];
    });
  }, [plan, visuals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rooms: Record<string, Palette> = {};
      let ext: Palette | null = null;
      for (const { part, variant } of chosen) {
        const palette = await paletteFromImage(variant.dataUrl).catch(() => null);
        if (!palette) continue;
        if (part.kind === "exterior") ext = palette;
        else if (part.roomId) rooms[part.roomId] = palette;
      }
      if (!cancelled) {
        setPalettes(rooms);
        setExterior(ext);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chosen]);

  useEffect(() => {
    fetch("/api/sam3d")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setSam3dEnabled(Boolean(d.enabled)))
      .catch(() => setSam3dEnabled(false));
  }, []);

  if (!plan) return null;

  const current = STAGES[stage];
  const focus =
    chosen.find((c) => c.part.roomId && c.part.roomId === selectedRoomId) ??
    (selectedRoomId ? null : chosen.find((c) => c.part.kind === "exterior")) ??
    null;
  const selectedRoom = plan.rooms.find((r) => r.id === selectedRoomId);

  const convert = async ({ part, variant }: Chosen) => {
    setConverting(part.id);
    setSam3dError(null);
    try {
      const { dataUrl } = await postJson<{ dataUrl: string }>("/api/sam3d", { image: variant.dataUrl });
      setSam3d({ partId: part.id, variantId: variant.id, format: "glb", dataUrl });
    } catch (e) {
      setSam3dError(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setConverting(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <section className="card flex flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">4. Your home in 3D</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {plan.floors > 1 && (
              <select className="input-sm" value={maxFloor} onChange={(e) => setMaxFloor(Number(e.target.value))}>
                {Array.from({ length: plan.floors }, (_, f) => (
                  <option key={f} value={f}>
                    Up to {f === 0 ? "ground floor" : `floor ${f}`}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={cutRoof} onChange={(e) => setCutRoof(e.target.checked)} />
              See inside (hide roof)
            </label>
          </div>
        </div>
        <div className="relative h-[460px] overflow-hidden rounded-lg">
          <House3D
            plan={plan}
            stage={stage}
            maxFloor={maxFloor}
            cutRoof={cutRoof}
            palettes={palettes}
            exterior={exterior}
            selectedRoomId={selectedRoomId}
            onRoomClick={setSelectedRoomId}
          />
          <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-xs text-stone-600">
            Drag to rotate · scroll to zoom · tap a room
          </p>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              Stage {stage + 1}/{STAGES.length}: {current.label}
            </span>
            <button type="button" className="chip" onClick={() => setStage(stage === STAGES.length - 1 ? 0 : stage + 1)}>
              {stage === STAGES.length - 1 ? "Start over" : "Next stage →"}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={STAGES.length - 1}
            value={stage}
            onChange={(e) => setStage(Number(e.target.value))}
            className="mt-2 w-full accent-amber-600"
            aria-label="Construction stage"
          />
          <div className="mt-1 hidden justify-between text-[10px] text-stone-500 sm:flex">
            {STAGES.map((s) => (
              <span key={s.id}>{s.label}</span>
            ))}
          </div>
          <p className="muted mt-2 text-sm">{current.note}</p>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="card">
          <h3 className="font-semibold">{selectedRoom ? selectedRoom.name : "Front view"}</h3>
          {focus ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={focus.variant.dataUrl} alt={focus.part.title} className="mt-2 aspect-[3/2] w-full rounded-lg object-cover" />
          ) : (
            <p className="muted mt-2 text-sm">
              No image chosen for this part yet.{" "}
              <button type="button" className="underline" onClick={() => setStep("visuals")}>
                Pick one
              </button>
            </p>
          )}
          {selectedRoom && (
            <p className="muted mt-2 text-sm">
              {selectedRoom.width}′ × {selectedRoom.depth}′ · {Math.round(selectedRoom.width * selectedRoom.depth)} sq ft
            </p>
          )}
        </section>

        {chosen.length > 0 && (
          <section className="card">
            <h3 className="font-semibold">Chosen looks</h3>
            <p className="muted mb-2 text-xs">Wall and floor colours in 3D come from these images.</p>
            <ul className="grid grid-cols-3 gap-2">
              {chosen.map(({ part, variant }) => (
                <li key={part.id}>
                  <button type="button" className="w-full text-left" onClick={() => setSelectedRoomId(part.roomId)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={variant.dataUrl} alt={part.title} className="aspect-square w-full rounded object-cover" />
                    <span className="block truncate text-xs">{part.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card">
          <h3 className="font-semibold">Turn an image into a 3D object</h3>
          <p className="muted mb-2 text-xs">Uses Meta SAM 3D to reconstruct the chosen image as a 3D model.</p>
          {!sam3dEnabled ? (
            <p className="text-sm text-stone-600">SAM 3D server not connected. Set SAM3D_ENDPOINT_URL to enable this.</p>
          ) : focus ? (
            <button type="button" className="btn-secondary" disabled={converting !== null} onClick={() => convert(focus)}>
              {converting === focus.part.id ? "Converting… (can take a minute)" : `Convert “${focus.part.title}”`}
            </button>
          ) : (
            <p className="text-sm text-stone-600">Select a room with a chosen image.</p>
          )}
          {sam3dError && <p className="mt-2 text-sm text-red-700">{sam3dError}</p>}
          {focus && sam3d[focus.part.id]?.variantId === focus.variant.id && (
            <div className="mt-3 h-64 overflow-hidden rounded-lg">
              <GlbViewer url={sam3d[focus.part.id].dataUrl} />
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
