import { isSameSpace } from "./plan";
import type { HousePlan, Room } from "./types";

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

export const EXTERIOR_WALL = 0.75; // 9 inch
export const INTERIOR_WALL = 0.375; // 4.5 inch
export const PLINTH = 1.5;
export const SLAB = 0.5;
export const LINTEL = 7;
export const SILL = 3;
const COLUMN = 0.75;
const EPS = 0.3;

type Gap = { start: number; end: number; kind: "door" | "window" };

const GAP_PRIORITY = { door: 1, window: 0 } as const;

// Overlapping openings become one gap; a door wins over a window.
function mergeGaps(gaps: Gap[]): Gap[] {
  const sorted = [...gaps].sort((a, b) => a.start - b.start);
  const merged: Gap[] = [];
  for (const g of sorted) {
    const last = merged[merged.length - 1];
    if (last && g.start < last.end - 0.01) {
      last.end = Math.max(last.end, g.end);
      if (GAP_PRIORITY[g.kind] > GAP_PRIORITY[last.kind]) last.kind = g.kind;
    } else {
      merged.push({ ...g });
    }
  }
  return merged;
}

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
    if (room.floor === 0) box(`plinth-${room.id}`, "plinth", null, 0, x, x + w, 0, PLINTH, y, y + d);
    box(`slab-${room.id}`, "slab", null, room.floor, x, x + w, top, top + SLAB, y, y + d);
    box(`tile-${room.id}`, "floorFinish", room, room.floor, x, x + w, base, base + 0.05, y, y + d);
  }

  for (let floor = 0; floor < plan.floors; floor++) {
    const rooms = plan.rooms.filter((r) => r.floor === floor);
    if (!rooms.length) continue;
    const base = floorBase(plan, floor);
    const top = base + plan.floorHeight;
    for (const seg of wallSegments(rooms)) {
      const gaps = mergeGaps(
        globalOpenings
          .filter((o) => o.floor === floor && o.horizontal === seg.horizontal && Math.abs(o.line - seg.line) < EPS)
          .map((o) => ({ start: Math.max(o.start, seg.start), end: Math.min(o.end, seg.end), kind: o.kind }))
          .filter((g) => g.end - g.start > 0.2),
      );
      const wall = (key: string, kind: ElementKind, a: number, b: number, y0: number, y1: number) =>
        seg.horizontal
          ? box(key, kind, null, floor, a, b, y0, y1, seg.t0, seg.t1, seg.exterior)
          : box(key, kind, null, floor, seg.t0, seg.t1, y0, y1, a, b, seg.exterior);
      const id = `f${floor}-${seg.horizontal ? "h" : "v"}-${seg.line.toFixed(2)}-${seg.start.toFixed(2)}`;
      let cursor = seg.drawStart;
      gaps.forEach((g, i) => {
        if (g.start > cursor) wall(`wall-${id}-${i}`, "wall", cursor, g.start, base, top);
        wall(`lintel-${id}-${i}`, "wall", g.start, g.end, base + LINTEL, top);
        if (g.kind === "window") {
          wall(`sill-${id}-${i}`, "wall", g.start, g.end, base, base + SILL);
          wall(`glass-${id}-${i}`, "glass", g.start, g.end, base + SILL, base + LINTEL);
        }
        cursor = Math.max(cursor, g.end);
      });
      if (seg.drawEnd > cursor) wall(`wall-${id}-end`, "wall", cursor, seg.drawEnd, base, top);
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
    const onFloor = plan.rooms.filter((r) => r.floor === c.floor);
    const minX = Math.min(...onFloor.map((r) => r.x));
    const maxX = Math.max(...onFloor.map((r) => r.x + r.width));
    const minY = Math.min(...onFloor.map((r) => r.y));
    const maxY = Math.max(...onFloor.map((r) => r.y + r.depth));
    const cx = Math.min(Math.max(c.x, minX + half), maxX - half);
    const cy = Math.min(Math.max(c.y, minY + half), maxY - half);
    box(`col-${k}`, "column", null, c.floor, cx - half, cx + half, c.floor === 0 ? 0 : base, base + plan.floorHeight + SLAB, cy - half, cy + half);
  }

  return els;
}

type WallSegment = {
  horizontal: boolean;
  line: number;
  // Extent of the shared edge, used to clip openings.
  start: number;
  end: number;
  // Extent actually drawn: interior walls extend into corners so joints are clean.
  drawStart: number;
  drawEnd: number;
  // Wall thickness across the line.
  t0: number;
  t1: number;
  exterior: boolean;
};

const PROBE = 0.2;
// Build each wall once along shared room edges (instead of a box of walls per room), so
// neighbouring rooms share one wall and corners meet cleanly.
function wallSegments(rooms: Room[]): WallSegment[] {
  const roomAt = (px: number, py: number) => rooms.find((r) => px > r.x && px < r.x + r.width && py > r.y && py < r.y + r.depth);
  const minX = Math.min(...rooms.map((r) => r.x));
  const maxX = Math.max(...rooms.map((r) => r.x + r.width));
  const minY = Math.min(...rooms.map((r) => r.y));
  const maxY = Math.max(...rooms.map((r) => r.y + r.depth));
  const segments: WallSegment[] = [];

  for (const horizontal of [true, false]) {
    const lines = dedupe(rooms.flatMap((r) => (horizontal ? [r.y, r.y + r.depth] : [r.x, r.x + r.width])));
    const breaks = dedupe(rooms.flatMap((r) => (horizontal ? [r.x, r.x + r.width] : [r.y, r.y + r.depth])));
    for (const line of lines) {
      type Piece = { a: number; b: number; status: "none" | "interior" | "ext-before" | "ext-after" };
      const pieces: Piece[] = [];
      for (let k = 0; k < breaks.length - 1; k++) {
        const a = breaks[k];
        const b = breaks[k + 1];
        const mid = (a + b) / 2;
        const before = horizontal ? roomAt(mid, line - PROBE) : roomAt(line - PROBE, mid);
        const after = horizontal ? roomAt(mid, line + PROBE) : roomAt(line + PROBE, mid);
        let status: Piece["status"] = "none";
        if (before && after) status = before !== after && !isSameSpace(before, after) ? "interior" : "none";
        else if (before) status = "ext-after";
        else if (after) status = "ext-before";
        pieces.push({ a, b, status });
      }
      // Merge consecutive pieces with the same status into runs.
      const runs: Piece[] = [];
      for (const p of pieces) {
        const last = runs[runs.length - 1];
        if (last && last.status === p.status && Math.abs(last.b - p.a) < 0.01) last.b = p.b;
        else runs.push({ ...p });
      }
      for (const run of runs) {
        if (run.status === "none") continue;
        const exterior = run.status !== "interior";
        const t = exterior ? EXTERIOR_WALL : INTERIOR_WALL;
        // Exterior walls sit inside the footprint; interior walls are centred on the shared edge.
        const t0 = run.status === "ext-before" ? line : run.status === "ext-after" ? line - t : line - t / 2;
        segments.push({ horizontal, line, start: run.a, end: run.b, drawStart: run.a, drawEnd: run.b, t0, t1: t0 + t, exterior });
      }
    }
  }

  // Interior wall ends reach into the wall they meet (just its half-thickness) so joints are closed;
  // ends that meet nothing stay flush, which avoids stubs sticking into open rooms and corridors.
  const meets = (seg: WallSegment, at: number) =>
    segments.some(
      (o) => o.horizontal !== seg.horizontal && !o.exterior && Math.abs(o.line - at) < 0.05 && seg.line >= o.start - 0.05 && seg.line <= o.end + 0.05,
    );
  const lo = (h: boolean) => (h ? minX : minY) + 0.1;
  const hi = (h: boolean) => (h ? maxX : maxY) - 0.1;
  for (const seg of segments) {
    if (seg.exterior) continue;
    if (meets(seg, seg.start)) seg.drawStart = Math.max(lo(seg.horizontal), seg.start - INTERIOR_WALL / 2);
    if (meets(seg, seg.end)) seg.drawEnd = Math.min(hi(seg.horizontal), seg.end + INTERIOR_WALL / 2);
  }
  return segments;
}

function dedupe(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > 0.05);
}
