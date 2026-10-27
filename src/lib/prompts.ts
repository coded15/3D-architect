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
