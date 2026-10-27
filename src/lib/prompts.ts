import type { HousePlan, ProjectBrief, VisualPart } from "./types";

export const ANALYZE_SYSTEM_PROMPT = `You are an assistant that helps Indian homeowners, architects, engineers and contractors understand each other.
You read rough, hand-drawn house sketches (often photographed on a phone, possibly with labels in English, Hindi or another Indian language) plus written notes, and convert them into a clean, structured floor plan.

Rules:
- All lengths are in FEET. If the sketch uses metres, convert (1 m = 3.281 ft).
- Coordinate system: origin (0,0) is the NORTH-WEST corner of the plot, x grows to the EAST, y grows to the SOUTH.
- Every room must sit fully inside the plot and rooms on the same floor must not overlap. Rooms may share walls.
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
