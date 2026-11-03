import { z } from "zod";
import type { HousePlan, Room, Side } from "./types";

export const FURNITURE_KINDS = [
  "bed",
  "wardrobe",
  "nightstand",
  "dressing_table",
  "sofa",
  "armchair",
  "coffee_table",
  "tv_unit",
  "dining_table",
  "chair",
  "kitchen_counter",
  "fridge",
  "toilet",
  "washbasin",
  "shower",
  "washing_machine",
  "mandir",
  "study_table",
  "bookshelf",
  "cabinet",
  "plant",
  "rug",
  "car",
  "swing",
  "bench",
] as const;
export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

export const FurnitureItemSchema = z.object({
  roomId: z.string(),
  kind: z.enum(FURNITURE_KINDS),
  label: z.string(),
  // Centre of the footprint in feet from the room's north-west corner (x towards east, y towards south).
  x: z.number(),
  y: z.number(),
  // Footprint as placed: width along x (east-west), depth along y (north-south).
  width: z.number().positive(),
  depth: z.number().positive(),
  // Direction the front of the item points (bed: foot end, sofa: where you look when seated).
  facing: z.enum(["N", "E", "S", "W"]),
  color: z.string(),
});
export type FurnitureItem = z.infer<typeof FurnitureItemSchema>;

export const FurnishSchema = z.object({ items: z.array(FurnitureItemSchema).max(120) });

export type Part = {
  key: string;
  roomId: string;
  shape: "box" | "cylinder" | "sphere";
  // three.js coordinates (feet): x east, y up, z south, centred on the plot.
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  opacity?: number;
};

const DEFAULT_COLORS: Record<FurnitureKind, string> = {
  bed: "#8b5e3c",
  wardrobe: "#a47148",
  nightstand: "#8b5e3c",
  dressing_table: "#a47148",
  sofa: "#c9b79c",
  armchair: "#b5835a",
  coffee_table: "#7a4e2d",
  tv_unit: "#6b4429",
  dining_table: "#7a4e2d",
  chair: "#7a4e2d",
  kitchen_counter: "#f1ece4",
  fridge: "#d9dde0",
  toilet: "#f5f5f5",
  washbasin: "#f5f5f5",
  shower: "#e9edf0",
  washing_machine: "#f2f2f2",
  mandir: "#a0522d",
  study_table: "#8b5e3c",
  bookshelf: "#8b5e3c",
  cabinet: "#a47148",
  plant: "#3f7d3a",
  rug: "#b5583f",
  car: "#c0392b",
  swing: "#8b5e3c",
  bench: "#8b5e3c",
};

// Usual footprint (across x depth, facing south) used when the model gives an absurd size.
const TYPICAL: Record<FurnitureKind, [number, number]> = {
  bed: [5, 6.5],
  wardrobe: [4, 2],
  nightstand: [1.5, 1.5],
  dressing_table: [3, 1.5],
  sofa: [6.5, 3],
  armchair: [2.8, 2.8],
  coffee_table: [3.5, 2],
  tv_unit: [5, 1.5],
  dining_table: [5, 6],
  chair: [1.6, 1.6],
  kitchen_counter: [6, 2],
  fridge: [2.5, 2.3],
  toilet: [1.5, 2.3],
  washbasin: [1.8, 1.5],
  shower: [3, 3],
  washing_machine: [2, 2],
  mandir: [2.5, 1.5],
  study_table: [4, 2],
  bookshelf: [3, 1.2],
  cabinet: [3, 1.5],
  plant: [1.5, 1.5],
  rug: [6, 4],
  car: [6, 13.5],
  swing: [4.5, 2.5],
  bench: [4, 1.5],
};

const HEX = /^#[0-9a-f]{6}$/i;
const OPPOSITE: Record<Side, Side> = { N: "S", S: "N", E: "W", W: "E" };
// Items whose back belongs against a wall.
const AGAINST_WALL = new Set<FurnitureKind>([
  "bed",
  "wardrobe",
  "dressing_table",
  "sofa",
  "tv_unit",
  "kitchen_counter",
  "fridge",
  "toilet",
  "washbasin",
  "mandir",
  "study_table",
  "bookshelf",
  "cabinet",
  "washing_machine",
]);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const EPS = 0.3;

// Inner usable rectangle of a room in plan feet: walls eat into it (9" outer walls sit inside the footprint).
export function roomInterior(plan: HousePlan, room: Room) {
  const neighbours = plan.rooms.filter((r) => r.id !== room.id && r.floor === room.floor);
  const sideIsInterior = (side: Side) =>
    neighbours.some((r) => {
      if (side === "N") return Math.abs(r.y + r.depth - room.y) < EPS && overlap(r.x, r.x + r.width, room.x, room.x + room.width) > 1;
      if (side === "S") return Math.abs(r.y - (room.y + room.depth)) < EPS && overlap(r.x, r.x + r.width, room.x, room.x + room.width) > 1;
      if (side === "W") return Math.abs(r.x + r.width - room.x) < EPS && overlap(r.y, r.y + r.depth, room.y, room.y + room.depth) > 1;
      return Math.abs(r.x - (room.x + room.width)) < EPS && overlap(r.y, r.y + r.depth, room.y, room.y + room.depth) > 1;
    });
  const m = (side: Side) => (sideIsInterior(side) ? 0.25 : 0.8);
  return { x0: room.x + m("W"), x1: room.x + room.width - m("E"), y0: room.y + m("N"), y1: room.y + room.depth - m("S") };
}

function overlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

// Doors on a room's walls (including doors that belong to the neighbouring room), as 3 ft deep keep-clear zones.
function doorZones(plan: HousePlan, room: Room) {
  const zones: { x0: number; x1: number; y0: number; y1: number; horizontal: boolean }[] = [];
  for (const o of plan.openings) {
    if (o.kind !== "door") continue;
    const owner = plan.rooms.find((r) => r.id === o.roomId);
    if (!owner || owner.floor !== room.floor) continue;
    const horizontal = o.side === "N" || o.side === "S";
    const line = horizontal ? (o.side === "N" ? owner.y : owner.y + owner.depth) : o.side === "W" ? owner.x : owner.x + owner.width;
    const start = (horizontal ? owner.x : owner.y) + o.offset - 0.3;
    const end = start + o.width + 0.6;
    if (horizontal) {
      if (Math.abs(line - room.y) < EPS) zones.push({ x0: start, x1: end, y0: room.y, y1: room.y + 3, horizontal });
      else if (Math.abs(line - (room.y + room.depth)) < EPS) zones.push({ x0: start, x1: end, y0: room.y + room.depth - 3, y1: room.y + room.depth, horizontal });
    } else {
      if (Math.abs(line - room.x) < EPS) zones.push({ x0: room.x, x1: room.x + 3, y0: start, y1: end, horizontal });
      else if (Math.abs(line - (room.x + room.width)) < EPS) zones.push({ x0: room.x + room.width - 3, x1: room.x + room.width, y0: start, y1: end, horizontal });
    }
  }
  return zones.filter((z) => overlap(z.x0, z.x1, room.x, room.x + room.width) > 0 && overlap(z.y0, z.y1, room.y, room.y + room.depth) > 0);
}

// Keep model output sane: known rooms only, sizes that fit, inside the walls, and out of doorways where possible.
export function normalizeFurniture(plan: HousePlan, items: FurnitureItem[]): FurnitureItem[] {
  const byId = new Map(plan.rooms.map((r) => [r.id, r]));
  return items.flatMap((raw) => {
    const room = byId.get(raw.roomId);
    if (!room) return [];
    const inner = roomInterior(plan, room);
    const innerW = inner.x1 - inner.x0;
    const innerD = inner.y1 - inner.y0;
    if (innerW < 1 || innerD < 1) return [];
    const [tw, td] = TYPICAL[raw.kind];
    const rotated = raw.facing === "E" || raw.facing === "W";
    const typicalW = rotated ? td : tw;
    const typicalD = rotated ? tw : td;
    const sane = (v: number, typical: number) => (Number.isFinite(v) && v > 0.3 && v < typical * 3 ? v : typical);
    let width = clamp(sane(raw.width, typicalW), 0.5, innerW);
    let depth = clamp(sane(raw.depth, typicalD), 0.5, innerD);
    // Work in plan coordinates, then convert back to room-local.
    let cx = clamp(room.x + raw.x, inner.x0 + width / 2, inner.x1 - width / 2);
    let cy = clamp(room.y + raw.y, inner.y0 + depth / 2, inner.y1 - depth / 2);
    let facing = raw.facing;

    // Things that stand against a wall should have their back to it. If the model put one against a wall
    // but facing along it, turn it to face away from that wall (keeping its proportions) and push it flush.
    if (AGAINST_WALL.has(raw.kind)) {
      const gap = { N: cy - depth / 2 - inner.y0, S: inner.y1 - (cy + depth / 2), W: cx - width / 2 - inner.x0, E: inner.x1 - (cx + width / 2) };
      const back = OPPOSITE[facing];
      if (gap[back] > 0.6) {
        const wall = (Object.keys(gap) as Side[]).reduce((a, b) => (gap[a] <= gap[b] ? a : b));
        if (gap[wall] <= 0.6) {
          const turnsAxis = (wall === "N" || wall === "S") !== (back === "N" || back === "S");
          if (turnsAxis && depth <= innerW && width <= innerD) [width, depth] = [depth, width];
          facing = OPPOSITE[wall];
        }
      }
      const flushBack = OPPOSITE[facing];
      const backGap = { N: cy - depth / 2 - inner.y0, S: inner.y1 - (cy + depth / 2), W: cx - width / 2 - inner.x0, E: inner.x1 - (cx + width / 2) }[flushBack];
      if (backGap <= 1.5) {
        if (flushBack === "N") cy = inner.y0 + depth / 2;
        if (flushBack === "S") cy = inner.y1 - depth / 2;
        if (flushBack === "W") cx = inner.x0 + width / 2;
        if (flushBack === "E") cx = inner.x1 - width / 2;
      }
      cx = clamp(cx, inner.x0 + width / 2, inner.x1 - width / 2);
      cy = clamp(cy, inner.y0 + depth / 2, inner.y1 - depth / 2);
    }

    if (raw.kind !== "rug") {
      for (const zone of doorZones(plan, room)) {
        const ix = overlap(cx - width / 2, cx + width / 2, zone.x0, zone.x1);
        const iy = overlap(cy - depth / 2, cy + depth / 2, zone.y0, zone.y1);
        if (ix <= 0 || iy <= 0) continue;
        // Slide along the wall the door is in (smallest move that still fits); otherwise step away from the wall.
        const candidates = zone.horizontal
          ? [zone.x0 - width / 2, zone.x1 + width / 2].filter((v) => v - width / 2 >= inner.x0 - 0.01 && v + width / 2 <= inner.x1 + 0.01)
          : [zone.y0 - depth / 2, zone.y1 + depth / 2].filter((v) => v - depth / 2 >= inner.y0 - 0.01 && v + depth / 2 <= inner.y1 + 0.01);
        if (candidates.length) {
          const current = zone.horizontal ? cx : cy;
          const best = candidates.reduce((a, b) => (Math.abs(a - current) <= Math.abs(b - current) ? a : b));
          if (zone.horizontal) cx = best;
          else cy = best;
        } else if (zone.horizontal) {
          cy = zone.y0 <= room.y + 0.01 ? clamp(zone.y1 + depth / 2, inner.y0 + depth / 2, inner.y1 - depth / 2) : clamp(zone.y0 - depth / 2, inner.y0 + depth / 2, inner.y1 - depth / 2);
        } else {
          cx = zone.x0 <= room.x + 0.01 ? clamp(zone.x1 + width / 2, inner.x0 + width / 2, inner.x1 - width / 2) : clamp(zone.x0 - width / 2, inner.x0 + width / 2, inner.x1 - width / 2);
        }
      }
    }

    return [
      {
        ...raw,
        facing,
        width: round(width),
        depth: round(depth),
        x: round(cx - room.x),
        y: round(cy - room.y),
        color: HEX.test(raw.color) ? raw.color : DEFAULT_COLORS[raw.kind],
        label: raw.label || raw.kind.replace("_", " "),
      },
    ];
  });
}

const round = (v: number) => Math.round(v * 100) / 100;

// Plain-language room descriptions for the furnishing prompt (room-local coordinates).
export function describeRoomsForFurnishing(plan: HousePlan): string {
  return plan.rooms
    .map((room) => {
      const inner = roomInterior(plan, room);
      const openings = plan.openings
        .filter((o) => o.roomId === room.id)
        .map((o) => {
          const along = o.side === "N" || o.side === "S" ? "x" : "y";
          return `${o.kind} on ${o.side} wall from ${along}=${o.offset} to ${along}=${round(o.offset + o.width)}`;
        });
      const doorsIn = doorZones(plan, room)
        .map((z) => `${z.horizontal ? `x ${round(z.x0 - room.x)}-${round(z.x1 - room.x)}` : `y ${round(z.y0 - room.y)}-${round(z.y1 - room.y)}`}`)
        .join(", ");
      return [
        `- ${room.name} (id ${room.id}, type ${room.type}, floor ${room.floor}): ${room.width} x ${room.depth} ft;`,
        `usable area x ${round(inner.x0 - room.x)}..${round(inner.x1 - room.x)}, y ${round(inner.y0 - room.y)}..${round(inner.y1 - room.y)};`,
        openings.length ? `openings: ${openings.join("; ")};` : "openings: none listed;",
        doorsIn ? `keep clear (doorways): ${doorsIn}` : "",
      ].join(" ");
    })
    .join("\n");
}

// Fallback furnishing when the model is unavailable: one or two sensible items per room type.
export function defaultFurniture(plan: HousePlan): FurnitureItem[] {
  const items: FurnitureItem[] = [];
  for (const room of plan.rooms) {
    const inner = roomInterior(plan, room);
    const w = inner.x1 - inner.x0;
    const d = inner.y1 - inner.y0;
    const lx = inner.x0 - room.x;
    const ly = inner.y0 - room.y;
    const add = (kind: FurnitureKind, label: string, x: number, y: number, width: number, depth: number, facing: Side) =>
      items.push({ roomId: room.id, kind, label, x, y, width, depth, facing, color: DEFAULT_COLORS[kind] });
    const north = (kind: FurnitureKind, label: string, width: number, depth: number, along = 0.5) =>
      add(kind, label, lx + w * along, ly + depth / 2, Math.min(width, w), depth, "S");
    const south = (kind: FurnitureKind, label: string, width: number, depth: number, along = 0.5) =>
      add(kind, label, lx + w * along, ly + d - depth / 2, Math.min(width, w), depth, "N");
    const name = room.name.toLowerCase();
    switch (room.type) {
      case "bedroom":
        north("bed", w >= 9 ? "Queen bed" : "Single bed", w >= 9 ? 5 : 3, 6.5);
        south("wardrobe", "Wardrobe", Math.min(4, w * 0.5), 2, 0.3);
        add("nightstand", "Bedside table", lx + w * 0.5 + (w >= 9 ? 3.3 : 2.3), ly + 0.75, 1.5, 1.5, "S");
        break;
      case "living":
        south("sofa", "Sofa", Math.min(6.5, w * 0.7), 3);
        add("coffee_table", "Coffee table", lx + w / 2, ly + d / 2 + 0.5, 3.5, 2, "N");
        north("tv_unit", "TV unit", Math.min(5, w * 0.6), 1.5);
        if (name.includes("pooja") || name.includes("living")) add("plant", "Plant", lx + 0.9, ly + 0.9, 1.4, 1.4, "S");
        break;
      case "kitchen":
        north("kitchen_counter", "Kitchen counter", w, 2);
        if (name.includes("dining") && d > 9) add("dining_table", "Dining table", lx + w / 2, ly + d - 3.2, Math.min(5, w - 1), 5, "N");
        else add("fridge", "Fridge", lx + w - 1.3, ly + d - 1.2, 2.5, 2.3, "N");
        break;
      case "dining":
        add("dining_table", "Dining table", lx + w / 2, ly + d / 2, Math.min(5, w - 1), Math.min(6, d - 1), "S");
        break;
      case "bathroom":
        north("toilet", "WC", 1.5, 2.3, 0.25);
        north("washbasin", "Wash basin", 1.8, 1.5, 0.75);
        break;
      case "pooja":
        add("mandir", "Mandir", lx + 1, ly + d / 2, 1.5, 2.5, "E");
        break;
      case "balcony":
        north("swing", "Jhula", Math.min(4.5, w * 0.6), 2.5);
        add("plant", "Plant", lx + 0.8, ly + d - 0.8, 1.4, 1.4, "N");
        break;
      case "parking":
        add("car", "Car", lx + w / 2, ly + d / 2, Math.min(6, w), Math.min(13.5, d), "S");
        break;
      case "study":
        north("study_table", "Study table", Math.min(4, w), 2);
        add("chair", "Chair", lx + w / 2, ly + 2.8, 1.6, 1.6, "N");
        south("bookshelf", "Bookshelf", Math.min(3, w), 1.2);
        break;
      case "store":
      case "utility":
        north("cabinet", "Storage cabinet", Math.min(4, w), Math.min(1.5, d));
        break;
      default:
        break;
    }
  }
  return normalizeFurniture(plan, items);
}

// Shade a hex colour: amount > 0 lightens, < 0 darkens.
export function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Build simple composite shapes for a furniture item. Parts are described in an item-local frame:
// u across the item's front (0..W), v from the back towards the front (0..D), h above the floor.
export function furnitureParts(item: FurnitureItem, room: Room, plan: HousePlan, floorY: number): Part[] {
  const across = item.facing === "N" || item.facing === "S";
  const W = across ? item.width : item.depth;
  const D = across ? item.depth : item.width;
  const x0 = room.x + item.x - item.width / 2;
  const x1 = x0 + item.width;
  const y0 = room.y + item.y - item.depth / 2;
  const y1 = y0 + item.depth;
  const ox = plan.plot.width / 2;
  const oz = plan.plot.depth / 2;
  const parts: Part[] = [];
  const c = item.color;
  const id = `${item.roomId}-${item.kind}-${item.x}-${item.y}`;

  const toPlan = (u: number, v: number): [number, number] => {
    switch (item.facing) {
      case "S":
        return [x0 + u, y0 + v];
      case "N":
        return [x1 - u, y1 - v];
      case "E":
        return [x0 + v, y1 - u];
      case "W":
        return [x1 - v, y0 + u];
    }
  };
  const add = (u0: number, u1: number, v0: number, v1: number, h0: number, h1: number, color: string, shape: Part["shape"] = "box", opacity?: number) => {
    const [ax, ay] = toPlan(u0, v0);
    const [bx, by] = toPlan(u1, v1);
    const px0 = Math.min(ax, bx);
    const px1 = Math.max(ax, bx);
    const py0 = Math.min(ay, by);
    const py1 = Math.max(ay, by);
    parts.push({
      key: `${id}-${parts.length}`,
      roomId: item.roomId,
      shape,
      position: [(px0 + px1) / 2 - ox, floorY + (h0 + h1) / 2, (py0 + py1) / 2 - oz],
      size: [Math.max(px1 - px0, 0.02), Math.max(h1 - h0, 0.02), Math.max(py1 - py0, 0.02)],
      color,
      opacity,
    });
  };
  const legs = (u0: number, u1: number, v0: number, v1: number, h: number, color: string, t = 0.15) => {
    add(u0, u0 + t, v0, v0 + t, 0, h, color);
    add(u1 - t, u1, v0, v0 + t, 0, h, color);
    add(u0, u0 + t, v1 - t, v1, 0, h, color);
    add(u1 - t, u1, v1 - t, v1, 0, h, color);
  };
  const chair = (u0: number, u1: number, v0: number, v1: number, color: string, backAtV0: boolean) => {
    legs(u0 + 0.1, u1 - 0.1, v0 + 0.1, v1 - 0.1, 1.45, shade(color, -0.25), 0.12);
    add(u0, u1, v0, v1, 1.45, 1.6, color);
    if (backAtV0) add(u0, u1, v0, v0 + 0.15, 1.6, 3.1, color);
    else add(u0, u1, v1 - 0.15, v1, 1.6, 3.1, color);
  };

  switch (item.kind) {
    case "bed": {
      add(0, W, 0.3, D, 0, 1.2, c);
      add(0, W, 0, 0.35, 0, 3.4, shade(c, -0.15));
      add(0.15, W - 0.15, 0.35, D - 0.1, 1.2, 1.8, "#f4f1ea");
      add(0.1, W - 0.1, D * 0.5, D - 0.05, 1.75, 1.95, shade(c, 0.35));
      const pillows = W >= 4 ? 2 : 1;
      const pw = (W - 0.6 - (pillows - 1) * 0.2) / pillows;
      for (let i = 0; i < pillows; i++) add(0.3 + i * (pw + 0.2), 0.3 + i * (pw + 0.2) + pw, 0.5, 1.6, 1.8, 2.15, "#ffffff");
      break;
    }
    case "wardrobe":
      add(0, W, 0, D, 0, 6.8, c);
      add(W / 2 - 0.02, W / 2 + 0.02, D - 0.02, D + 0.02, 0.2, 6.6, shade(c, -0.4));
      add(W / 2 - 0.35, W / 2 - 0.2, D, D + 0.08, 3, 3.8, "#c9c9c9");
      add(W / 2 + 0.2, W / 2 + 0.35, D, D + 0.08, 3, 3.8, "#c9c9c9");
      break;
    case "nightstand":
    case "cabinet":
      add(0, W, 0, D, 0, item.kind === "cabinet" ? 2.8 : 1.8, c);
      add(-0.03, W + 0.03, -0.03, D + 0.03, item.kind === "cabinet" ? 2.8 : 1.8, (item.kind === "cabinet" ? 2.8 : 1.8) + 0.1, shade(c, 0.2));
      break;
    case "dressing_table":
      add(0, W, 0, D, 0, 2.5, c);
      add(W * 0.15, W * 0.85, 0, 0.1, 2.6, 5.6, "#cfe6f2");
      break;
    case "sofa":
    case "armchair": {
      const arm = Math.min(0.5, W * 0.15);
      add(0, W, 0.2, D, 0, 1.4, c);
      add(arm, W - arm, 0.7, D, 1.4, 1.75, shade(c, 0.15));
      add(0, W, 0, 0.7, 0, 2.9, shade(c, -0.08));
      add(0, arm, 0, D, 0, 2.1, shade(c, -0.08));
      add(W - arm, W, 0, D, 0, 2.1, shade(c, -0.08));
      if (W > 4) {
        add(arm + 0.1, arm + 1.3, 0.7, 1.0, 1.75, 2.8, "#b5583f");
        add(W - arm - 1.3, W - arm - 0.1, 0.7, 1.0, 1.75, 2.8, "#d4a017");
      }
      break;
    }
    case "coffee_table":
      legs(0.1, W - 0.1, 0.1, D - 0.1, 1.25, shade(c, -0.2));
      add(0, W, 0, D, 1.25, 1.4, c);
      break;
    case "tv_unit": {
      add(0, W, 0, D, 0, 1.6, c);
      const tvW = Math.min(W * 0.75, 4.5);
      add((W - tvW) / 2, (W + tvW) / 2, 0.1, 0.25, 2.2, 2.2 + tvW * 0.56, "#111111");
      break;
    }
    case "dining_table": {
      const chairs = D > 3 ? 0.9 : 0;
      legs(0.4, W - 0.4, chairs + 0.1, D - chairs - 0.1, 2.4, shade(c, -0.2));
      add(0.3, W - 0.3, chairs, D - chairs, 2.4, 2.55, c);
      if (chairs) {
        const count = Math.max(1, Math.floor((W - 0.6) / 1.9));
        const gap = (W - count * 1.5) / (count + 1);
        for (let i = 0; i < count; i++) {
          const u0 = gap + i * (1.5 + gap);
          chair(u0, u0 + 1.5, 0, 1.3, shade(c, 0.1), true);
          chair(u0, u0 + 1.5, D - 1.3, D, shade(c, 0.1), false);
        }
      }
      break;
    }
    case "chair":
      chair(0, W, 0, D, c, true);
      break;
    case "bench":
      legs(0.1, W - 0.1, 0.1, D - 0.1, 1.5, shade(c, -0.2));
      add(0, W, 0, D, 1.5, 1.65, c);
      break;
    case "kitchen_counter": {
      add(0, W, 0, D, 0, 2.6, c);
      add(0, W, 0, D + 0.05, 2.6, 2.75, "#3b3b3b");
      add(0, W, 0, 0.05, 2.75, 4.5, "#e8e2d6");
      if (W > 3) add(0, W, 0, 1.1, 4.6, 6.6, shade(c, -0.05));
      if (W >= 3) add(0.5, Math.min(2.2, W - 0.4), 0.45, Math.min(1.6, D - 0.2), 2.75, 2.8, "#b8c0c8");
      if (W >= 5) add(W - 2.4, W - 0.5, 0.45, Math.min(1.6, D - 0.2), 2.75, 2.82, "#111111");
      break;
    }
    case "fridge":
      add(0, W, 0, D, 0, 5.8, c);
      add(W - 0.35, W - 0.25, D, D + 0.1, 3.2, 4.8, "#9aa0a6");
      break;
    case "toilet": {
      add(0.2, W - 0.2, 0, 0.55, 1.0, 2.6, "#ffffff");
      const dia = Math.min(W - 0.1, 1.4);
      add(W / 2 - dia / 2, W / 2 + dia / 2, 0.55, 0.55 + Math.min(D - 0.6, 1.7), 0, 1.3, "#f7f7f7", "cylinder");
      break;
    }
    case "washbasin":
      add(W / 2 - 0.25, W / 2 + 0.25, 0.1, 0.6, 0, 2.5, "#f2f2f2", "cylinder");
      add(0.1, W - 0.1, 0.05, D, 2.5, 2.85, "#ffffff");
      add(0.2, W - 0.2, 0, 0.05, 3.6, 5.4, "#cfe6f2");
      break;
    case "shower":
      add(0, W, 0, D, 0, 0.15, c);
      add(0, W, D - 0.06, D, 0.15, 6.5, "#bfe3f5", "box", 0.35);
      add(W / 2 - 0.3, W / 2 + 0.3, 0, 0.8, 6.3, 6.4, "#c0c0c0");
      break;
    case "washing_machine":
      add(0, W, 0, D, 0, 2.8, c);
      add(W * 0.25, W * 0.75, D - 0.02, D + 0.04, 0.7, 2.0, "#4a5560");
      break;
    case "mandir":
      add(0, W, 0, D, 0, 2.6, c);
      add(W * 0.12, W * 0.88, 0.1, D - 0.25, 2.6, 4.5, shade(c, 0.15));
      add(W * 0.25, W * 0.75, 0.2, Math.max(0.7, D - 0.6), 4.5, 5.3, "#d4a017", "sphere");
      add(W * 0.3, W * 0.7, 0, 0.12, 2.8, 4.2, "#7a1f1f");
      add(W / 2 - 0.15, W / 2 + 0.15, D - 0.25, D - 0.05, 2.6, 2.7, "#d4a017", "cylinder");
      break;
    case "study_table":
      add(0, W, 0, D, 2.4, 2.5, c);
      add(0, Math.min(1.4, W * 0.35), 0, D, 0, 2.4, shade(c, -0.1));
      add(W - 0.15, W, 0, 0.15, 0, 2.4, shade(c, -0.2));
      add(W - 0.15, W, D - 0.15, D, 0, 2.4, shade(c, -0.2));
      break;
    case "bookshelf": {
      add(0, W, 0, D, 0, 6, c);
      const books = ["#b5583f", "#2e5e8c", "#d4a017", "#3f7d3a", "#7a1f1f"];
      for (let s = 0; s < 4; s++) {
        for (let b = 0; b < 3; b++) {
          const u0 = 0.2 + b * (W - 0.4) / 3;
          add(u0, u0 + (W - 0.4) / 3 - 0.15, D - 0.1, D + 0.02, 0.6 + s * 1.4, 1.5 + s * 1.4, books[(s + b) % books.length]);
        }
      }
      break;
    }
    case "plant": {
      const dia = Math.min(W, D);
      add(W / 2 - dia * 0.3, W / 2 + dia * 0.3, D / 2 - dia * 0.3, D / 2 + dia * 0.3, 0, 1.2, "#b5583f", "cylinder");
      add(W / 2 - dia / 2, W / 2 + dia / 2, D / 2 - dia / 2, D / 2 + dia / 2, 1.1, 1.1 + dia * 1.1, c, "sphere");
      break;
    }
    case "rug":
      add(0, W, 0, D, 0, 0.03, c);
      add(0.4, W - 0.4, 0.4, D - 0.4, 0.03, 0.04, shade(c, 0.3));
      break;
    case "car": {
      // Car facing: front (bonnet) at v = D.
      add(0.1, W - 0.1, 0, D, 0.7, 2.5, c);
      add(0.4, W - 0.4, D * 0.22, D * 0.7, 2.5, 4.0, "#2b3a44");
      for (const [u0, v0] of [
        [0, D * 0.12],
        [W - 0.5, D * 0.12],
        [0, D * 0.72],
        [W - 0.5, D * 0.72],
      ]) {
        add(u0, u0 + 0.5, v0, v0 + 2, 0, 1.3, "#1c1c1c");
      }
      break;
    }
    case "swing": {
      const ceiling = plan.floorHeight;
      add(0.2, W - 0.2, D * 0.3, D * 0.75, 1.5, 1.7, c);
      add(0.2, W - 0.2, D * 0.3, D * 0.3 + 0.12, 1.7, 3.0, c);
      for (const u of [0.25, W - 0.35]) {
        add(u, u + 0.08, D * 0.32, D * 0.32 + 0.08, 1.7, ceiling, "#6b6b6b");
        add(u, u + 0.08, D * 0.72, D * 0.72 + 0.08, 1.7, ceiling, "#6b6b6b");
      }
      break;
    }
  }
  return parts;
}
