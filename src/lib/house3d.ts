import type { HousePlan, Room, Side } from "./types";

export const STAGES = [
  { id: "marking", label: "Site marking", note: "Plot boundary and room positions are marked on the ground." },
  { id: "foundation", label: "Foundation & plinth", note: "Footings are cast and the plinth is raised above ground level." },
  { id: "columns", label: "Columns", note: "RCC columns go up at the corners that carry the roof." },
  { id: "brickwork", label: "Brickwork", note: "Walls are built up to lintel level; door and window openings are left." },
  { id: "slab", label: "Lintel & roof slab", note: "Lintels span the openings and the roof slab is cast." },
  { id: "plaster", label: "Plaster & paint", note: "Walls are plastered and painted." },
  { id: "finishing", label: "Finishing", note: "Flooring, windows and final touches." },
] as const;

export type ElementKind = "marking" | "plinth" | "column" | "wall" | "slab" | "floorFinish" | "glass";

export type Element = {
  key: string;
  kind: ElementKind;
  roomId: string | null;
  floor: number;
  exterior: boolean;
  // Center position and size in feet, three.js axes (y up, z = south).
  position: [number, number, number];
  size: [number, number, number];
};

export const WALL_THICKNESS = 0.375; // per room, so shared walls end up ~9 inches
export const PLINTH = 1.5;
export const SLAB = 0.5;
export const LINTEL = 7;
export const SILL = 3;
const COLUMN = 0.75;
const EPS = 0.3;

type Gap = { start: number; end: number; kind: "door" | "window" };

export function floorBase(plan: HousePlan, floor: number) {
  return PLINTH + floor * (plan.floorHeight + SLAB);
}

export function buildHouse(plan: HousePlan): Element[] {
  const ox = plan.plot.width / 2;
  const oz = plan.plot.depth / 2;
  const els: Element[] = [];
  const box = (
    key: string,
    kind: ElementKind,
    room: Room | null,
    floor: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    exterior = false,
  ) => {
    els.push({
      key,
      kind,
      roomId: room?.id ?? null,
      floor,
      exterior,
      position: [(x0 + x1) / 2 - ox, (y0 + y1) / 2, (z0 + z1) / 2 - oz],
      size: [Math.max(x1 - x0, 0.01), Math.max(y1 - y0, 0.01), Math.max(z1 - z0, 0.01)],
    });
  };

  const globalOpenings = plan.openings.flatMap((o) => {
    const room = plan.rooms.find((r) => r.id === o.roomId);
    if (!room) return [];
    const horizontal = o.side === "N" || o.side === "S";
    const line = horizontal ? (o.side === "N" ? room.y : room.y + room.depth) : o.side === "W" ? room.x : room.x + room.width;
    const start = (horizontal ? room.x : room.y) + o.offset;
    return [{ floor: room.floor, horizontal, line, start, end: start + o.width, kind: o.kind }];
  });

  for (const room of plan.rooms) {
    const base = floorBase(plan, room.floor);
    const top = base + plan.floorHeight;
    const { x, y, width: w, depth: d } = room;

    box(`mark-${room.id}`, "marking", room, room.floor, x, x + w, 0, 0.02, y, y + d);
    if (room.floor === 0) box(`plinth-${room.id}`, "plinth", room, 0, x, x + w, 0, PLINTH, y, y + d);
    box(`slab-${room.id}`, "slab", room, room.floor, x, x + w, top, top + SLAB, y, y + d);
    box(`tile-${room.id}`, "floorFinish", room, room.floor, x + WALL_THICKNESS, x + w - WALL_THICKNESS, base, base + 0.05, y + WALL_THICKNESS, y + d - WALL_THICKNESS);

    const sides: Side[] = ["N", "S", "W", "E"];
    for (const side of sides) {
      const horizontal = side === "N" || side === "S";
      const line = horizontal ? (side === "N" ? y : y + d) : side === "W" ? x : x + w;
      // N/S walls run the full width; E/W walls fit between them so corners don't overlap.
      const spanStart = horizontal ? x : y + WALL_THICKNESS;
      const spanEnd = horizontal ? x + w : y + d - WALL_THICKNESS;
      const exterior = !plan.rooms.some(
        (other) => other.id !== room.id && other.floor === room.floor && sharesEdge(other, horizontal, line, spanStart, spanEnd),
      );
      const gaps: Gap[] = globalOpenings
        .filter((o) => o.floor === room.floor && o.horizontal === horizontal && Math.abs(o.line - line) < EPS)
        .map((o) => ({ start: Math.max(o.start, spanStart), end: Math.min(o.end, spanEnd), kind: o.kind }))
        .filter((g) => g.end - g.start > 0.2)
        .sort((a, b) => a.start - b.start);

      const inward = side === "N" || side === "W" ? 1 : -1;
      const t0 = line + (inward > 0 ? 0 : -WALL_THICKNESS);
      const t1 = line + (inward > 0 ? WALL_THICKNESS : 0);
      const wall = (key: string, kind: ElementKind, a: number, b: number, y0: number, y1: number) =>
        horizontal
          ? box(key, kind, room, room.floor, a, b, y0, y1, t0, t1, exterior)
          : box(key, kind, room, room.floor, t0, t1, y0, y1, a, b, exterior);

      let cursor = spanStart;
      gaps.forEach((g, i) => {
        const id = `${room.id}-${side}-${i}`;
        if (g.start > cursor) wall(`wall-${id}-s`, "wall", cursor, g.start, base, top);
        wall(`wall-${id}-lintel`, "wall", g.start, g.end, base + LINTEL, top);
        if (g.kind === "window") {
          wall(`wall-${id}-sill`, "wall", g.start, g.end, base, base + SILL);
          wall(`glass-${id}`, "glass", g.start, g.end, base + SILL, base + LINTEL);
        }
        cursor = Math.max(cursor, g.end);
      });
      if (spanEnd > cursor) wall(`wall-${room.id}-${side}-end`, "wall", cursor, spanEnd, base, top);
    }
  }

  const corners = new Map<string, { x: number; y: number; floor: number }>();
  for (const r of plan.rooms) {
    for (const [cx, cy] of [
      [r.x, r.y],
      [r.x + r.width, r.y],
      [r.x, r.y + r.depth],
      [r.x + r.width, r.y + r.depth],
    ]) {
      const k = `${r.floor}:${Math.round(cx * 2)}:${Math.round(cy * 2)}`;
      if (!corners.has(k)) corners.set(k, { x: cx, y: cy, floor: r.floor });
    }
  }
  for (const [k, c] of corners) {
    const base = floorBase(plan, c.floor);
    const half = COLUMN / 2;
    const cx = Math.min(Math.max(c.x, half), plan.plot.width - half);
    const cy = Math.min(Math.max(c.y, half), plan.plot.depth - half);
    box(`col-${k}`, "column", null, c.floor, cx - half, cx + half, c.floor === 0 ? 0 : base, base + plan.floorHeight + SLAB, cy - half, cy + half);
  }

  return els;
}

function sharesEdge(other: Room, horizontal: boolean, line: number, a: number, b: number) {
  if (horizontal) {
    const touches = Math.abs(other.y - line) < EPS || Math.abs(other.y + other.depth - line) < EPS;
    return touches && Math.min(b, other.x + other.width) - Math.max(a, other.x) > 1;
  }
  const touches = Math.abs(other.x - line) < EPS || Math.abs(other.x + other.width - line) < EPS;
  return touches && Math.min(b, other.y + other.depth) - Math.max(a, other.y) > 1;
}
