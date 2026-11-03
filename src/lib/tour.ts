import { findConnections, OUTSIDE, type Connection } from "./planCheck";
import type { HousePlan, Room } from "./types";

// Plan-feet waypoint. `stop` = pause and look around towards `look`; `jump` = cut straight there (unreachable room).
export type TourPoint = {
  x: number;
  y: number;
  stop?: { roomId: string; name: string; look: { x: number; y: number } };
  jump?: boolean;
};

const ENTRANCE_PRIORITY = ["balcony", "living", "passage", "dining", "kitchen"];

const center = (r: Room) => ({ x: r.x + r.width / 2, y: r.y + r.depth / 2 });
const isStop = (r: Room) => r.type !== "passage" && r.width * r.depth >= 12;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// Walk the ground floor depth-first from the main entrance, going through doorway midpoints.
// In each room, stop just inside the door and look across the room (like a property video).
export function buildTour(plan: HousePlan, floor = 0): TourPoint[] {
  const rooms = plan.rooms.filter((r) => r.floor === floor);
  if (!rooms.length) return [];
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const conns = findConnections(plan).filter((c) => c.floor === floor);
  const adjacency = new Map<string, { to: string; c: Connection }[]>();
  for (const c of conns) {
    if (!adjacency.has(c.a)) adjacency.set(c.a, []);
    if (!adjacency.has(c.b)) adjacency.set(c.b, []);
    adjacency.get(c.a)!.push({ to: c.b, c });
    adjacency.get(c.b)!.push({ to: c.a, c });
  }

  // Which way is "into" a room from a connection's wall line.
  const inwardSign = (c: Connection, room: Room) => {
    const mid = center(room);
    return c.horizontal ? Math.sign(mid.y - c.y) || 1 : Math.sign(mid.x - c.x) || 1;
  };
  const along = (c: Connection, d: number) => (c.horizontal ? { x: c.x, y: c.y + d } : { x: c.x + d, y: c.y });
  const extent = (c: Connection, room: Room) => (c.horizontal ? room.depth : room.width);

  // Points just before, on, and just after a doorway, kept inside each room.
  const crossing = (c: Connection, fromRoom: Room | null, toRoom: Room) => {
    const intoTo = inwardSign(c, toRoom);
    const before = fromRoom ? Math.min(1.2, extent(c, fromRoom) / 2) : 1.2;
    const after = Math.min(1.2, extent(c, toRoom) / 2);
    return [along(c, -intoTo * before), along(c, 0), along(c, intoTo * after)];
  };

  // Viewpoint a few steps inside the door, looking towards the far side of the room.
  const viewpoint = (c: Connection, room: Room): TourPoint => {
    const sign = inwardSign(c, room);
    const depth = extent(c, room);
    const p = along(c, sign * Math.min(2.2, depth * 0.3));
    const margin = 1.2;
    const x = clamp(p.x, room.x + margin, room.x + room.width - margin);
    const y = clamp(p.y, room.y + margin, room.y + room.depth - margin);
    const look = c.horizontal ? { x: room.x + room.width / 2, y: sign > 0 ? room.y + room.depth : room.y } : { x: sign > 0 ? room.x + room.width : room.x, y: room.y + room.depth / 2 };
    return { x, y, stop: { roomId: room.id, name: room.name, look } };
  };

  const points: TourPoint[] = [];
  const visited = new Set<string>();
  // Only detour into corridors that lead to a room we haven't seen yet.
  const leadsToNewRoom = (start: Room) => {
    const seen = new Set<string>([...visited, start.id]);
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      const room = byId.get(id);
      if (room && isStop(room) && !visited.has(id)) return true;
      for (const { to } of adjacency.get(id) ?? []) {
        if (to === OUTSIDE || seen.has(to)) continue;
        seen.add(to);
        queue.push(to);
      }
    }
    return false;
  };
  // Don't walk back out of a room just to cut away somewhere else.
  const trimToLastStop = () => {
    while (points.length && !points[points.length - 1].stop) points.pop();
  };
  // Rooms are rectangles, so straight lines between points inside one room never cross its walls.
  const visit = (room: Room, entry: Connection | null) => {
    visited.add(room.id);
    if (isStop(room)) {
      const via = entry ?? (adjacency.get(room.id) ?? [])[0]?.c ?? null;
      points.push(via ? viewpoint(via, room) : { ...center(room), stop: { roomId: room.id, name: room.name, look: { x: room.x, y: room.y } } });
    }
    for (const { to, c } of adjacency.get(room.id) ?? []) {
      if (to === OUTSIDE || visited.has(to)) continue;
      const next = byId.get(to);
      if (!next || !leadsToNewRoom(next)) continue;
      points.push(...crossing(c, room, next));
      visit(next, c);
      points.push(...crossing(c, next, room));
    }
  };

  const entrances = conns
    .filter((c) => c.kind === "door" && (c.a === OUTSIDE || c.b === OUTSIDE))
    .map((c) => ({ c, room: byId.get(c.a === OUTSIDE ? c.b : c.a) }))
    .filter((e): e is { c: Connection; room: Room } => Boolean(e.room))
    .sort((p, q) => rank(p.room) - rank(q.room));

  if (entrances.length) {
    const { c, room } = entrances[0];
    points.push(along(c, -inwardSign(c, room) * 10), ...crossing(c, null, room));
    visit(room, c);
  } else {
    const first = [...rooms].sort((p, q) => rank(p) - rank(q) || q.width * q.depth - p.width * p.depth)[0];
    points.push(center(first));
    visit(first, null);
  }

  // Rooms that can't be walked to (missing doors): cut to them from their own doorway if they have one.
  for (const room of rooms) {
    if (visited.has(room.id) || !isStop(room)) continue;
    const via = (adjacency.get(room.id) ?? [])[0]?.c ?? null;
    const view = via ? viewpoint(via, room) : center(room);
    trimToLastStop();
    points.push({ x: view.x, y: view.y, jump: true });
    visit(room, via);
  }

  // Don't walk all the way back out at the end.
  if (points.some((p) => p.stop)) trimToLastStop();
  return points;
}

function rank(room: Room) {
  const i = ENTRANCE_PRIORITY.indexOf(room.type);
  return i === -1 ? ENTRANCE_PRIORITY.length : i;
}
