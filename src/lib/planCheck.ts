import { isSameSpace } from "./plan";
import type { HousePlan, Room } from "./types";

export const OUTSIDE = "outside";
const PROBE = 0.5;
const EPS = 0.3;

export type PlanIssue = { kind: "no_door" | "unreachable" | "dead_end" | "auto_filled"; roomIds: string[]; message: string };

export type Topology = {
  // Human-readable connection list, e.g. "Main Bedroom (r1) --door--> Passage (fill-0-2-0)".
  connections: string[];
  issues: PlanIssue[];
};

// Which room (or outside) a door leads into, by probing just across its wall.
function doorTarget(plan: HousePlan, room: Room, side: string, offset: number, width: number): string {
  const horizontal = side === "N" || side === "S";
  const mid = (horizontal ? room.x : room.y) + offset + width / 2;
  const px = horizontal ? mid : side === "W" ? room.x - PROBE : room.x + room.width + PROBE;
  const py = horizontal ? (side === "N" ? room.y - PROBE : room.y + room.depth + PROBE) : mid;
  const other = plan.rooms.find(
    (r) => r.id !== room.id && r.floor === room.floor && px > r.x && px < r.x + r.width && py > r.y && py < r.y + r.depth,
  );
  return other?.id ?? OUTSIDE;
}

function sharedEdgeLength(a: Room, b: Room): number {
  if (a.floor !== b.floor) return 0;
  const touchX = Math.abs(a.x + a.width - b.x) < EPS || Math.abs(b.x + b.width - a.x) < EPS;
  const touchY = Math.abs(a.y + a.depth - b.y) < EPS || Math.abs(b.y + b.depth - a.y) < EPS;
  if (touchX) return Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  if (touchY) return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return 0;
}

export type Connection = {
  a: string;
  // Room id, or "outside".
  b: string;
  kind: "door" | "open";
  // Midpoint of the doorway / shared opening on the wall line, plan feet.
  x: number;
  y: number;
  // True when the wall runs east-west (so you cross it moving north-south).
  horizontal: boolean;
  floor: number;
};

// Every way to move between spaces: doors (to rooms or outside) and open joins between same-kind spaces.
export function findConnections(plan: HousePlan): Connection[] {
  const byId = new Map(plan.rooms.map((r) => [r.id, r]));
  const result: Connection[] = [];
  for (const o of plan.openings) {
    if (o.kind !== "door") continue;
    const room = byId.get(o.roomId);
    if (!room) continue;
    const horizontal = o.side === "N" || o.side === "S";
    const mid = (horizontal ? room.x : room.y) + o.offset + o.width / 2;
    const x = horizontal ? mid : o.side === "W" ? room.x : room.x + room.width;
    const y = horizontal ? (o.side === "N" ? room.y : room.y + room.depth) : mid;
    result.push({ a: room.id, b: doorTarget(plan, room, o.side, o.offset, o.width), kind: "door", x, y, horizontal, floor: room.floor });
  }
  for (const a of plan.rooms) {
    for (const b of plan.rooms) {
      if (a.id >= b.id || !isSameSpace(a, b) || sharedEdgeLength(a, b) <= 1) continue;
      const vertical = Math.abs(a.x + a.width - b.x) < EPS || Math.abs(b.x + b.width - a.x) < EPS;
      const x = vertical
        ? Math.abs(a.x + a.width - b.x) < EPS
          ? b.x
          : a.x
        : (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) / 2;
      const y = vertical
        ? (Math.max(a.y, b.y) + Math.min(a.y + a.depth, b.y + b.depth)) / 2
        : Math.abs(a.y + a.depth - b.y) < EPS
          ? b.y
          : a.y;
      result.push({ a: a.id, b: b.id, kind: "open", x, y, horizontal: !vertical, floor: a.floor });
    }
  }
  return result;
}

export function analyzeTopology(plan: HousePlan): Topology {
  const byId = new Map(plan.rooms.map((r) => [r.id, r]));
  const label = (id: string) => (id === OUTSIDE ? "Outside" : `${byId.get(id)?.name ?? id} (${id})`);
  const edges = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!edges.has(a)) edges.set(a, new Set());
    if (!edges.has(b)) edges.set(b, new Set());
    edges.get(a)!.add(b);
    edges.get(b)!.add(a);
  };
  const connections: string[] = [];
  const doorCount = new Map<string, number>();
  // Points (x, y) where each space is entered, used to spot corridor stubs that lead nowhere.
  const entryPoints = new Map<string, { x: number; y: number }[]>();
  const addPoint = (id: string, x: number, y: number) => {
    if (!entryPoints.has(id)) entryPoints.set(id, []);
    entryPoints.get(id)!.push({ x, y });
  };

  for (const c of findConnections(plan)) {
    link(c.a, c.b);
    connections.push(`${label(c.a)} --${c.kind}--> ${label(c.b)}`);
    addPoint(c.a, c.x, c.y);
    if (c.b !== OUTSIDE) addPoint(c.b, c.x, c.y);
    if (c.kind === "door") {
      doorCount.set(c.a, (doorCount.get(c.a) ?? 0) + 1);
      if (c.b !== OUTSIDE) doorCount.set(c.b, (doorCount.get(c.b) ?? 0) + 1);
    }
  }

  const issues: PlanIssue[] = [];
  const reachable = new Set<string>([OUTSIDE]);
  const queue = [OUTSIDE];
  while (queue.length) {
    for (const next of edges.get(queue.shift()!) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }

  for (const room of plan.rooms) {
    const neighbours = edges.get(room.id)?.size ?? 0;
    if (room.type !== "passage" && !doorCount.get(room.id)) {
      issues.push({ kind: "no_door", roomIds: [room.id], message: `${label(room.id)} has no door at all.` });
    } else if (!reachable.has(room.id)) {
      issues.push({ kind: "unreachable", roomIds: [room.id], message: `${label(room.id)} cannot be reached from the entrance.` });
    }
    if (room.type === "passage" && neighbours <= 1) {
      issues.push({
        kind: "dead_end",
        roomIds: [room.id],
        message: `${label(room.id)} (${room.width}x${room.depth} ft) is a dead end: it connects to only ${neighbours} space and leads nowhere.`,
      });
    } else if (room.type === "passage") {
      const stub = corridorStub(room, entryPoints.get(room.id) ?? []);
      if (stub > 3) {
        issues.push({
          kind: "dead_end",
          roomIds: [room.id],
          message: `${label(room.id)} runs ${stub.toFixed(1)} ft past its last door/opening and ends in a wall (dead-end corridor stub).`,
        });
      }
    }
    if (room.id.startsWith("fill-")) {
      issues.push({
        kind: "auto_filled",
        roomIds: [room.id],
        message: `${label(room.id)} at x=${room.x}, y=${room.y}, ${room.width}x${room.depth} ft was not on the sketch reading; the app filled leftover space here.`,
      });
    }
  }
  return { connections, issues };
}

// Longest stretch of a corridor (along its long axis) beyond the outermost point where it is entered.
function corridorStub(room: Room, points: { x: number; y: number }[]): number {
  if (!points.length) return Math.max(room.width, room.depth);
  const alongY = room.depth >= room.width;
  const coords = points.map((p) => (alongY ? p.y : p.x));
  const start = alongY ? room.y : room.x;
  const end = start + (alongY ? room.depth : room.width);
  return Math.max(Math.min(...coords) - start, end - Math.max(...coords));
}
