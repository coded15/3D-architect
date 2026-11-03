import type { HousePlan, ProjectBrief, VisualPart } from "./types";

export const ANALYZE_SYSTEM_PROMPT = `You are an assistant that helps Indian homeowners, architects, engineers and contractors understand each other.
You read rough, hand-drawn house sketches (often photographed on a phone, possibly with labels in English, Hindi or another Indian language) plus written notes, and convert them into a clean, structured floor plan.

Rules:
- All lengths are in FEET. If the sketch uses metres, convert (1 m = 3.281 ft).
- Coordinate system: origin (0,0) is the NORTH-WEST corner of the plot, x grows to the EAST, y grows to the SOUTH.
- Every room must sit fully inside the plot and rooms on the same floor must not overlap. Rooms may share walls.
- PRESERVE the room dimensions written on the sketch exactly (convert feet-inches like 10'7½" to 10.625). Never stretch or shrink a labelled room to fill the plot; leftover space is fine and should stay empty or become a "passage" / "other" room.
- Include every labelled space, even small unnamed ones (e.g. a "4' x 8'7½"" box becomes a "store" or "utility" room), and use labelled passage widths as written.
- Overall plot dimensions on the sketch are outer dimensions; room labels are usually inner (carpet) sizes, so a few inches of difference between them is wall thickness, not missing space.
- Rooms that share a wall on the sketch must TOUCH in your coordinates (e.g. room A ends at x=12 and room B starts at x=12). Don't leave wall-thickness gaps between rooms; absorb small differences (under ~1 ft) into the neighbouring room or passage.
- Corridors, lobbies and any other unlabelled space between rooms inside the house must be explicit "passage" rooms that fill that space completely, running the full length shown on the sketch, so the rooms together cover the whole built-up area without gaps.
- floor 0 is the ground floor, 1 is the first floor, and so on.
- If a dimension is missing, infer a typical Indian residential size and record it in "assumptions".
- Add at least one door per room and windows on external walls where sensible. Opening "offset" is measured in feet from the west end (for N/S walls) or north end (for E/W walls) of that room's wall.
- Use short, stable ids like "r1", "r2" for rooms and "o1", "o2" for openings.
- "summary" is 1-2 friendly sentences describing the home in plain language.
- "parts" lists the views worth visualising as images: always one "exterior" front elevation (roomId null), then one "room" part per important room (living, kitchen, bedrooms, pooja, etc.; skip passages, stores and stairs).
  Each part "prompt" is a vivid but faithful description for an image generator: the room's size, which walls have windows/doors, what it connects to, and the style the user asked for. Never invent rooms the user did not draw.`;

export function analyzeUserText(brief: ProjectBrief, sketchCount: number): string {
  const lines = [
    `Project: ${brief.title || "Untitled home"}`,
    brief.plotWidth && brief.plotDepth
      ? `Plot: ${brief.plotWidth} ft wide x ${brief.plotDepth} ft deep`
      : "Plot: read the size from the sketch, or assume a typical size",
    brief.facing ? `Road / entrance facing: ${brief.facing}` : "Facing: infer from the sketch, default E",
    brief.floors ? `Floors: ${brief.floors}` : "Floors: infer from the sketches",
    brief.style ? `Preferred style: ${brief.style}` : "Preferred style: modern Indian home",
    brief.notes ? `Notes from the user: ${brief.notes}` : "",
    sketchCount > 0
      ? `${sketchCount} sketch image(s) are attached. Treat them as the primary source of truth for layout.`
      : "No sketch attached; derive a reasonable layout from the notes.",
  ];
  return lines.filter(Boolean).join("\n");
}

export function partImagePrompt(plan: HousePlan, part: VisualPart, style: string, variantIndex: number): string {
  const room = part.roomId ? plan.rooms.find((r) => r.id === part.roomId) : null;
  const variety = [
    "warm natural daylight",
    "soft evening light with warm lamps",
    "bright overcast daylight",
  ][variantIndex % 3];

  const common = `Style: ${style || "modern Indian home"}. Photorealistic architectural visualisation, ${variety}. Realistic Indian materials and furniture, no text or labels in the image.`;

  if (part.kind === "exterior") {
    return `Front exterior view of a ${plan.floors}-storey house on a ${plan.plot.width} x ${plan.plot.depth} ft plot, entrance facing ${plan.plot.facing}. ${part.prompt} ${common} Use the attached hand sketch only as a reference for the layout and proportions.`;
  }

  const size = room ? ` The room is about ${room.width} x ${room.depth} ft.` : "";
  return `Interior view of the ${part.title}.${size} ${part.prompt} ${common} Use the attached hand sketch only as a reference for where doors and windows are.`;
}

export const REVIEW_SYSTEM_PROMPT = `You review a structured floor plan that was extracted from a homeowner's rough hand-drawn sketch, before anyone builds anything from it.
Your job is to find what is genuinely UNCLEAR and ask the homeowner short clarifying questions instead of guessing.

You receive: the sketch image(s), the user's notes, the current plan JSON (feet; origin north-west; x east, y south), the list of connections (which doors join which spaces), and automatically detected issues (dead-end corridors, rooms with no door, rooms unreachable from the entrance, spaces the app auto-filled as passage).

Ask about things like:
- a corridor that leads to a dead end: should it be removed, become part of a room (which one), become a storage/utility nook, or lead somewhere via a new door?
- space the app auto-filled: what is it really on the sketch?
- doors that look guessed (not drawn on the sketch) or missing doors needed to reach a room (e.g. kitchen only reachable from outside)
- room sizes that contradict the labels, unclear labels, where the main entrance is
Rules:
- Ask at most 6 questions, most important first. Ask nothing if the plan clearly matches the sketch.
- Each question must be answerable by a homeowner with no architecture knowledge, in plain words. Mention rooms by their names, not ids.
- "context" explains in one sentence what you noticed (e.g. "The sketch shows a 3 ft corridor but nothing at its north end").
- Give 2-5 concrete "options"; make the first option your best guess. The UI always adds an "Other" free-text choice, so don't include one.
- "roomIds" lists the plan room ids the question is about.`;

export const REVISE_SYSTEM_PROMPT = `You update a structured floor plan using a homeowner's answers to clarifying questions about their hand-drawn sketch.
Return the FULL updated plan JSON in the same schema.
Rules:
- Apply every answer faithfully. Where an answer is "Other: ...", follow the free text.
- Keep everything the answers don't mention unchanged, including room ids, part ids and labelled sizes.
- Same geometry rules as before: feet, origin north-west, x east, y south; rooms on a floor never overlap; rooms that share a wall touch exactly; corridors are explicit "passage" rooms; doors' "offset" is measured from the west (N/S walls) or north (E/W walls) end of that room's wall.
- Every room must be reachable from the entrance through doors or open passages; no corridor may end in a dead end unless the user asked for it.
- If an answer removes a room, also remove its openings and any "parts" pointing at it.
- Add a short note of what changed to "assumptions".`;

export function reviewUserText(planJson: string, connections: string[], issues: string[], notes: string): string {
  return [
    notes ? `User notes: ${notes}` : "User notes: (none)",
    `Current plan JSON:\n${planJson}`,
    `Connections:\n${connections.map((c) => `- ${c}`).join("\n") || "- (none)"}`,
    `Automatically detected issues:\n${issues.map((i) => `- ${i}`).join("\n") || "- (none)"}`,
  ].join("\n\n");
}

export function reviseUserText(planJson: string, answers: { question: string; answer: string }[], notes: string): string {
  return [
    notes ? `User notes: ${notes}` : "User notes: (none)",
    `Current plan JSON:\n${planJson}`,
    `Homeowner's answers:\n${answers.map((a, i) => `${i + 1}. Q: ${a.question}\n   A: ${a.answer}`).join("\n")}`,
  ].join("\n\n");
}

export const FURNISH_SYSTEM_PROMPT = `You are an interior designer furnishing a simple 3D model of an Indian home, room by room.
You receive every room with its size, usable area, doors/windows and doorway keep-clear zones, plus the photorealistic renders the homeowner CHOSE for some rooms (each image is labelled with its room).

Goal: the 3D furniture must look like the chosen renders. For a room with a render, place the main pieces you can see in it (same kind of items, similar arrangement against the same walls where possible, matching colours). For rooms without a render, furnish sensibly for the room type and the homeowner's style.

Coordinates (very important):
- Feet, ROOM-LOCAL: x from the room's west wall towards east, y from the room's north wall towards south.
- x, y is the CENTRE of the item's footprint. width = size along x (east-west), depth = size along y (north-south), i.e. already rotated: a bed facing S that is 5 ft wide and 6.5 ft long has width 5, depth 6.5; the same bed facing E has width 6.5, depth 5.
- facing = direction the FRONT of the item points: bed = foot end; sofa/chair/bench/swing = where you look when seated; wardrobe/counter/tv unit/fridge/cabinet/bookshelf/mandir = the side you open or stand at; toilet/washbasin = where you stand; car = bonnet.
- Keep the whole footprint inside the usable area.

Placement rules:
- Back of beds, sofas, wardrobes, counters, tv units, mandirs etc. against a wall (flush with the usable-area edge).
- Never block doorways: nothing (except a rug) inside a keep-clear zone. Leave a walkway of at least 2.5 ft to every door.
- No tall item (wardrobe, bookshelf, fridge) in front of a window.
- Items must not overlap each other (a rug may sit under a coffee table / bed / dining table).
- Realistic Indian sizes: king bed 6x6.5, queen 5x6.5, single 3x6.5; wardrobe 4-6 wide x 2 deep; nightstand 1.5x1.5; 3-seater sofa 6.5x3, armchair 2.8x2.8; coffee table 3.5x2; TV unit 5x1.5; dining_table footprint INCLUDES its chairs: 4-seater 4.5x5.5, 6-seater 5x7; kitchen counter 2 ft deep (use two items for an L-shape); fridge 2.5x2.3; toilet 1.5x2.3; washbasin 1.8x1.5; shower 3x3; mandir 2.5x1.5; study table 4x2; bookshelf 3x1.2; car 6x13.5; swing (jhula) 4.5x2.5; plant 1.5x1.5.
- Passages stay clear (at most a plant or a shoe cabinet). Parking: a car. Sit-out/verandah: a jhula, chairs, plants. Pooja: a mandir, ideally on the west wall facing east.
- Up to 8 items per room. Colours as hex, e.g. "#8b5a2b". "label" is a short friendly name like "Queen bed with storage".`;

export function furnishUserText(rooms: string, style: string, imageRooms: string[]): string {
  return [
    `Homeowner's style: ${style || "modern Indian home"}`,
    `Rooms:\n${rooms}`,
    imageRooms.length
      ? `Attached renders, in order: ${imageRooms.map((r, i) => `image ${i + 1} = ${r}`).join("; ")}.`
      : "No renders attached; furnish from the room types and style.",
  ].join("\n\n");
}
