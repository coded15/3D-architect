"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ViewMode } from "@/components/House3D";
import { downscaleDataUrl, postJson } from "@/lib/client";
import { normalizeFurniture, type FurnitureItem } from "@/lib/furniture";
import { STAGES } from "@/lib/house3d";
import { paletteFromImage, type Palette } from "@/lib/palette";
import { useProject } from "@/lib/store";
import type { ImageVariant, VisualPart } from "@/lib/types";

// three.js needs the browser; load the canvases on the client only.
const House3D = dynamic(() => import("@/components/House3D").then((m) => m.House3D), { ssr: false });
const GlbViewer = dynamic(() => import("@/components/GlbViewer").then((m) => m.GlbViewer), { ssr: false });

type Chosen = { part: VisualPart; variant: ImageVariant };

const FINISHED = STAGES.length - 1;

export function ModelStep() {
  const { plan, brief, visuals, sam3d, setSam3d, setStep, furniture, planRevision, setFurniture } = useProject();
  const [stage, setStage] = useState(FINISHED);
  const [maxFloor, setMaxFloor] = useState(0);
  const [cutRoof, setCutRoof] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [palettes, setPalettes] = useState<Record<string, Palette>>({});
  const [exterior, setExterior] = useState<Palette | null>(null);
  const [sam3dEnabled, setSam3dEnabled] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [sam3dError, setSam3dError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("orbit");
  const [tourKey, setTourKey] = useState(0);
  const [tourDone, setTourDone] = useState(false);
  const [hereRoomId, setHereRoomId] = useState<string | null>(null);
  const [cutKey, setCutKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showFurniture, setShowFurniture] = useState(true);
  const [furnishing, setFurnishing] = useState(false);
  const [furnishError, setFurnishError] = useState<string | null>(null);

  const chosen: Chosen[] = useMemo(() => {
    if (!plan) return [];
    return plan.parts.flatMap((part) => {
      const entry = visuals[part.id];
      const variant = entry?.variants.find((v) => v.id === entry.selectedId);
      return variant ? [{ part, variant }] : [];
    });
  }, [plan, visuals]);

  // Re-validate against the current plan so manual room edits never leave furniture inside walls.
  const items: FurnitureItem[] | null = useMemo(
    () => (plan && furniture && furniture.revision === planRevision ? normalizeFurniture(plan, furniture.items) : null),
    [plan, furniture, planRevision],
  );

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

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (!plan) return null;

  const current = STAGES[stage];
  const focus =
    chosen.find((c) => c.part.roomId && c.part.roomId === selectedRoomId) ??
    (selectedRoomId ? null : chosen.find((c) => c.part.kind === "exterior")) ??
    null;
  const selectedRoom = plan.rooms.find((r) => r.id === selectedRoomId);
  const hereRoom = plan.rooms.find((r) => r.id === hereRoomId);
  const hereImage = chosen.find((c) => c.part.roomId && c.part.roomId === hereRoomId);
  const roomItems = items?.filter((i) => i.roomId === (mode === "orbit" ? selectedRoomId : hereRoomId)) ?? [];

  const furnish = async () => {
    setFurnishing(true);
    setFurnishError(null);
    try {
      const images = await Promise.all(
        chosen
          .filter((c) => c.part.roomId)
          .map(async ({ part, variant }) => ({ roomId: part.roomId, title: part.title, dataUrl: await downscaleDataUrl(variant.dataUrl) })),
      );
      const result = await postJson<{ items: FurnitureItem[]; source: "ai" | "default" }>("/api/furnish", {
        plan,
        style: brief.style,
        images,
      });
      setFurniture(result.items, result.source);
      setShowFurniture(true);
      setStage(FINISHED);
    } catch (e) {
      setFurnishError(e instanceof Error ? e.message : "Furnishing failed");
    } finally {
      setFurnishing(false);
    }
  };

  const startTour = () => {
    setTourDone(false);
    setTourKey((k) => k + 1);
    setMode("tour");
  };

  const exitWalk = () => {
    setMode("orbit");
    setHereRoomId(null);
  };

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
            {plan.floors > 1 && mode === "orbit" && (
              <select className="input-sm" value={maxFloor} onChange={(e) => setMaxFloor(Number(e.target.value))}>
                {Array.from({ length: plan.floors }, (_, f) => (
                  <option key={f} value={f}>
                    Up to {f === 0 ? "ground floor" : `floor ${f}`}
                  </option>
                ))}
              </select>
            )}
            {mode === "orbit" && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={cutRoof} onChange={(e) => setCutRoof(e.target.checked)} />
                See inside (hide roof)
              </label>
            )}
            {items && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showFurniture} onChange={(e) => setShowFurniture(e.target.checked)} />
                Furniture
              </label>
            )}
          </div>
        </div>

        <div className={fullscreen ? "fixed inset-0 z-50 bg-black" : "relative h-[460px] overflow-hidden rounded-lg"}>
          <House3D
            plan={plan}
            stage={stage}
            maxFloor={maxFloor}
            cutRoof={cutRoof}
            palettes={palettes}
            exterior={exterior}
            selectedRoomId={selectedRoomId}
            onRoomClick={setSelectedRoomId}
            furniture={items}
            showFurniture={showFurniture}
            mode={mode}
            tourKey={tourKey}
            onTourEnd={() => setTourDone(true)}
            onTourCut={() => setCutKey((k) => k + 1)}
            onLocation={setHereRoomId}
          />
          {mode === "tour" && cutKey > 0 && (
            <div
              key={cutKey}
              className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: 0 }}
              ref={(el) => {
                el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
              }}
            />
          )}

          <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-2">
            {mode === "orbit" && (
              <>
                <button type="button" className="overlay-btn" onClick={() => setMode("walk")}>
                  🚶 Walk inside
                </button>
                <button type="button" className="overlay-btn" onClick={startTour}>
                  🎬 Take a tour
                </button>
              </>
            )}
            {mode === "walk" && (
              <button type="button" className="overlay-btn" onClick={startTour}>
                🎬 Tour
              </button>
            )}
            {mode !== "orbit" && (
              <button type="button" className="overlay-btn" onClick={exitWalk}>
                ✕ Exit
              </button>
            )}
            <button type="button" className="overlay-btn" onClick={() => setFullscreen((f) => !f)} aria-label="Toggle full screen">
              {fullscreen ? "⤡ Exit full screen" : "⛶"}
            </button>
          </div>

          {mode !== "orbit" && (
            <div className="pointer-events-none absolute left-3 top-3 flex max-w-[60%] items-center gap-3 rounded-xl bg-black/55 p-2 pr-4 text-white backdrop-blur">
              {hereImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hereImage.variant.dataUrl} alt="" className="h-14 w-20 rounded-md object-cover" />
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-white/70">{hereRoom ? "You are in" : "Outside"}</p>
                <p className="text-lg font-semibold leading-tight">{hereRoom?.name ?? (brief.title || "Your home")}</p>
                {hereRoom && (
                  <p className="text-xs text-white/70">
                    {hereRoom.width}′ × {hereRoom.depth}′
                    {roomItems.length ? ` · ${roomItems.map((i) => i.label).slice(0, 3).join(", ")}` : ""}
                  </p>
                )}
              </div>
            </div>
          )}

          {mode === "tour" && tourDone && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="flex gap-2 rounded-xl bg-white p-4 shadow-lg">
                <button type="button" className="btn-primary" onClick={startTour}>
                  Replay tour
                </button>
                <button type="button" className="btn-secondary" onClick={() => setMode("walk")}>
                  Walk around
                </button>
                <button type="button" className="btn-secondary" onClick={exitWalk}>
                  Overview
                </button>
              </div>
            </div>
          )}

          <p className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-xs text-stone-600">
            {mode === "orbit" && "Drag to rotate · scroll to zoom · tap a room"}
            {mode === "walk" && "W A S D / arrow keys to walk · drag to look around · Shift to go faster"}
            {mode === "tour" && "Guided tour through every room"}
          </p>
        </div>

        {mode === "orbit" && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                Stage {stage + 1}/{STAGES.length}: {current.label}
              </span>
              <button type="button" className="chip" onClick={() => setStage(stage === FINISHED ? 0 : stage + 1)}>
                {stage === FINISHED ? "Start over" : "Next stage →"}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={FINISHED}
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
        )}
      </section>

      <aside className="space-y-4">
        <section className="card">
          <h3 className="font-semibold">Furnish your home</h3>
          <p className="muted mb-3 text-xs">
            AI looks at each room&apos;s size, doors and windows, and at the looks you chose, then places matching furniture.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" disabled={furnishing} onClick={furnish}>
              {furnishing ? "Arranging furniture…" : items ? "✨ Re-arrange furniture" : "✨ Furnish with AI"}
            </button>
            {items && (
              <span className="text-xs text-stone-500">
                {items.length} pieces{furniture?.source === "default" ? " (standard layout)" : ""}
              </span>
            )}
          </div>
          {furnishing && <p className="muted mt-2 animate-pulse text-xs">Studying your chosen looks and measuring every room…</p>}
          {furnishError && <p className="mt-2 text-sm text-red-700">{furnishError}</p>}
        </section>

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
          {mode === "orbit" && roomItems.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {roomItems.map((i) => (
                <li key={`${i.kind}-${i.x}-${i.y}`} className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
                  {i.label}
                </li>
              ))}
            </ul>
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
