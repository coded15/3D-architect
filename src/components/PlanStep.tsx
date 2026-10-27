"use client";

import { useState } from "react";
import { ClarifyPanel } from "@/components/ClarifyPanel";
import { FloorPlan2D } from "@/components/FloorPlan2D";
import { normalizePlan, tidyPlan } from "@/lib/plan";
import { useProject } from "@/lib/store";
import type { Room } from "@/lib/types";

export function PlanStep() {
  const { plan, updatePlan, setStep } = useProject();
  const [floor, setFloor] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  if (!plan) return null;

  const rooms = plan.rooms.filter((r) => r.floor === floor);

  const editRoom = (id: string, patch: Partial<Room>) => {
    updatePlan(normalizePlan({ ...plan, rooms: plan.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="section-title">2. Here&apos;s what we understood</h2>
          {plan.floors > 1 && (
            <div className="flex gap-1">
              {Array.from({ length: plan.floors }, (_, f) => (
                <button key={f} type="button" className={f === floor ? "chip-active" : "chip"} onClick={() => setFloor(f)}>
                  {f === 0 ? "Ground" : `Floor ${f}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="aspect-[4/3] w-full rounded-lg bg-white">
          <FloorPlan2D plan={plan} floor={floor} highlightRoomId={selected} onRoomClick={setSelected} />
        </div>
        <p className="mt-3 text-stone-700">{plan.summary}</p>
        {plan.assumptions.length > 0 && (
          <details className="mt-2 text-sm text-stone-600">
            <summary className="cursor-pointer">Assumptions we made ({plan.assumptions.length})</summary>
            <ul className="mt-1 list-disc pl-5">
              {plan.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card flex flex-col">
        <h2 className="section-title">Fix anything that&apos;s off</h2>
        <p className="muted mb-3 text-sm">Sizes in feet. Tap a room on the plan to highlight it.</p>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-stone-500">
              <tr>
                <th className="py-1">Room</th>
                <th>W</th>
                <th>D</th>
                <th>X</th>
                <th>Y</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className={r.id === selected ? "bg-amber-50" : undefined} onClick={() => setSelected(r.id)}>
                  <td className="py-1 pr-2">
                    <input className="input-sm w-full" value={r.name} onChange={(e) => editRoom(r.id, { name: e.target.value })} />
                  </td>
                  {(["width", "depth", "x", "y"] as const).map((k) => (
                    <td key={k} className="pr-1">
                      <input
                        className="input-sm w-14"
                        type="number"
                        step={0.5}
                        value={r[k]}
                        onChange={(e) => e.target.value !== "" && editRoom(r.id, { [k]: Number(e.target.value) })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <button type="button" className="btn-primary" onClick={() => setStep("visuals")}>
            Show me how it looks →
          </button>
          <button type="button" className="btn-secondary" onClick={() => setStep("model")}>
            Open 3D view
          </button>
          <button type="button" className="btn-secondary" onClick={() => updatePlan(tidyPlan(plan))}>
            Close gaps between rooms
          </button>
        </div>
      </section>

      <div className="lg:col-span-2">
        <ClarifyPanel onHighlight={setSelected} />
      </div>
    </div>
  );
}
