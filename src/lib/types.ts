import { z } from "zod";

export const FacingSchema = z.enum(["N", "E", "S", "W"]);
export type Facing = z.infer<typeof FacingSchema>;

export const RoomTypeSchema = z.enum([
  "living",
  "bedroom",
  "kitchen",
  "dining",
  "bathroom",
  "pooja",
  "staircase",
  "balcony",
  "parking",
  "store",
  "study",
  "utility",
  "passage",
  "other",
]);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const SideSchema = z.enum(["N", "E", "S", "W"]);
export type Side = z.infer<typeof SideSchema>;

// All lengths are in feet. Origin (0,0) is the north-west corner of the plot;
// x grows towards east, y grows towards south.
export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: RoomTypeSchema,
  floor: z.number().int().min(0),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
});
export type Room = z.infer<typeof RoomSchema>;

export const OpeningSchema = z.object({
  id: z.string(),
  kind: z.enum(["door", "window"]),
  roomId: z.string(),
  side: SideSchema,
  // Feet from the west end (N/S walls) or north end (E/W walls) of the room's wall.
  offset: z.number().min(0),
  width: z.number().positive(),
});
export type Opening = z.infer<typeof OpeningSchema>;

export const PlotSchema = z.object({
  width: z.number().positive(),
  depth: z.number().positive(),
  facing: FacingSchema,
});
export type Plot = z.infer<typeof PlotSchema>;

export const VisualPartSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["exterior", "room"]),
  roomId: z.string().nullable(),
  prompt: z.string(),
});
export type VisualPart = z.infer<typeof VisualPartSchema>;

export const HousePlanSchema = z.object({
  plot: PlotSchema,
  floors: z.number().int().min(1).max(4),
  floorHeight: z.number().positive(),
  rooms: z.array(RoomSchema),
  openings: z.array(OpeningSchema),
  summary: z.string(),
  assumptions: z.array(z.string()),
  parts: z.array(VisualPartSchema),
});
export type HousePlan = z.infer<typeof HousePlanSchema>;

export type Sketch = {
  id: string;
  name: string;
  dataUrl: string;
};

export type ImageVariant = {
  id: string;
  dataUrl: string;
  responseId: string | null;
  instruction: string;
};

export type PartVisuals = {
  partId: string;
  variants: ImageVariant[];
  selectedId: string | null;
};

export type ProjectBrief = {
  title: string;
  plotWidth: number | null;
  plotDepth: number | null;
  facing: Facing | null;
  floors: number | null;
  notes: string;
  style: string;
};

export const BriefSchema = z.object({
  title: z.string(),
  plotWidth: z.number().nullable(),
  plotDepth: z.number().nullable(),
  facing: FacingSchema.nullable(),
  floors: z.number().nullable(),
  notes: z.string(),
  style: z.string(),
});

export const ClarifyingQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  // Why the AI is asking: what it saw on the sketch / in the plan that is ambiguous.
  context: z.string(),
  options: z.array(z.string()).min(2).max(5),
  roomIds: z.array(z.string()),
});
export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;

export const ReviewSchema = z.object({
  questions: z.array(ClarifyingQuestionSchema).max(6),
});

export type ClarifyAnswer = { questionId: string; question: string; answer: string };

export type Sam3dAsset = {
  partId: string;
  variantId: string;
  format: "glb" | "ply";
  dataUrl: string;
};
