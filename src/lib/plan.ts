import type { HousePlan, Room } from "./types";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// Keep model output geometrically sane: rooms inside the plot, openings within their wall.
export function normalizePlan(plan: HousePlan): HousePlan {
  const { width: pw, depth: pd } = plan.plot;
  const rooms: Room[] = plan.rooms.map((r) => {
    const width = clamp(r.width, 1, pw);
    const depth = clamp(r.depth, 1, pd);
    return {
      ...r,
      floor: clamp(r.floor, 0, plan.floors - 1),
      width,
      depth,
      x: clamp(r.x, 0, pw - width),
      y: clamp(r.y, 0, pd - depth),
    };
  });
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const openings = plan.openings.flatMap((o) => {
    const room = byId.get(o.roomId);
    if (!room) return [];
    const wallLength = o.side === "N" || o.side === "S" ? room.width : room.depth;
    const width = clamp(o.width, 1, Math.max(1, wallLength - 0.5));
    return [{ ...o, width, offset: clamp(o.offset, 0, Math.max(0, wallLength - width)) }];
  });
  const roomIds = new Set(rooms.map((r) => r.id));
  const parts = plan.parts.map((p) => (p.roomId && !roomIds.has(p.roomId) ? { ...p, roomId: null } : p));
  return { ...plan, rooms, openings, parts };
}

export function mockPlan(style: string): HousePlan {
  return normalizePlan({
    plot: { width: 30, depth: 40, facing: "E" },
    floors: 1,
    floorHeight: 10,
    summary:
      "A single-storey 2BHK on a 30 x 40 ft east-facing plot, with a front living room, open kitchen-dining, two bedrooms and a pooja corner.",
    assumptions: ["Mock data: set MODEL_API_KEY to analyse your real sketch.", "Wall height assumed 10 ft."],
    rooms: [
      { id: "r1", name: "Living Room", type: "living", floor: 0, x: 14, y: 0, width: 16, depth: 14 },
      { id: "r2", name: "Pooja", type: "pooja", floor: 0, x: 8, y: 0, width: 6, depth: 6 },
      { id: "r3", name: "Parking", type: "parking", floor: 0, x: 0, y: 0, width: 8, depth: 14 },
      { id: "r4", name: "Kitchen", type: "kitchen", floor: 0, x: 0, y: 14, width: 10, depth: 10 },
      { id: "r5", name: "Dining", type: "dining", floor: 0, x: 10, y: 14, width: 10, depth: 10 },
      { id: "r6", name: "Bathroom", type: "bathroom", floor: 0, x: 20, y: 14, width: 10, depth: 8 },
      { id: "r7", name: "Master Bedroom", type: "bedroom", floor: 0, x: 0, y: 24, width: 15, depth: 16 },
      { id: "r8", name: "Bedroom 2", type: "bedroom", floor: 0, x: 15, y: 24, width: 15, depth: 16 },
      { id: "r9", name: "Passage", type: "passage", floor: 0, x: 8, y: 6, width: 6, depth: 8 },
    ],
    openings: [
      { id: "o1", kind: "door", roomId: "r1", side: "E", offset: 5, width: 4 },
      { id: "o2", kind: "window", roomId: "r1", side: "N", offset: 5, width: 6 },
      { id: "o3", kind: "door", roomId: "r1", side: "S", offset: 2, width: 3 },
      { id: "o4", kind: "door", roomId: "r2", side: "S", offset: 1.5, width: 3 },
      { id: "o5", kind: "window", roomId: "r4", side: "W", offset: 3, width: 4 },
      { id: "o6", kind: "door", roomId: "r4", side: "E", offset: 3, width: 3 },
      { id: "o7", kind: "door", roomId: "r5", side: "N", offset: 3, width: 4 },
      { id: "o8", kind: "door", roomId: "r6", side: "W", offset: 2, width: 2.5 },
      { id: "o9", kind: "window", roomId: "r6", side: "E", offset: 3, width: 2 },
      { id: "o10", kind: "door", roomId: "r7", side: "N", offset: 11, width: 3 },
      { id: "o11", kind: "window", roomId: "r7", side: "W", offset: 5, width: 5 },
      { id: "o12", kind: "window", roomId: "r7", side: "S", offset: 5, width: 5 },
      { id: "o13", kind: "door", roomId: "r8", side: "N", offset: 1, width: 3 },
      { id: "o14", kind: "window", roomId: "r8", side: "E", offset: 5, width: 5 },
      { id: "o15", kind: "window", roomId: "r8", side: "S", offset: 5, width: 5 },
      { id: "o16", kind: "door", roomId: "r3", side: "N", offset: 1, width: 6 },
    ],
    parts: [
      { id: "p1", title: "Front Elevation", kind: "exterior", roomId: null, prompt: `East-facing front with a car porch on the left and a large living room window.` },
      { id: "p2", title: "Living Room", kind: "room", roomId: "r1", prompt: "Spacious living room with the main entrance door on the east wall and a wide window on the north wall." },
      { id: "p3", title: "Kitchen", kind: "room", roomId: "r4", prompt: "Compact L-shaped kitchen with a window over the platform on the west wall, opening to the dining area." },
      { id: "p4", title: "Master Bedroom", kind: "room", roomId: "r7", prompt: "Master bedroom with windows on the west and south walls, a double bed and a wardrobe." },
      { id: "p5", title: "Pooja Room", kind: "room", roomId: "r2", prompt: "Small pooja room with a carved wooden mandir and brass diyas." },
    ].map((p) => ({ ...p, prompt: `${p.prompt} ${style}`.trim() })) as HousePlan["parts"],
  });
}

export const ROOM_COLORS: Record<string, string> = {
  living: "#f6c177",
  bedroom: "#9ccfd8",
  kitchen: "#eb6f92",
  dining: "#f2a7b8",
  bathroom: "#7aa2f7",
  pooja: "#f9d65c",
  staircase: "#b4a7d6",
  balcony: "#a3d9a5",
  parking: "#c0c0c0",
  store: "#d4b896",
  study: "#c4a7e7",
  utility: "#9ab0a6",
  passage: "#e6e1d6",
  other: "#d9d9d9",
};
