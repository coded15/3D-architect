import { z } from "zod";
import { defaultFurniture, describeRoomsForFurnishing, FurnishSchema, normalizeFurniture } from "@/lib/furniture";
import { isMockMode } from "@/lib/meta";
import { FURNISH_SYSTEM_PROMPT, furnishUserText } from "@/lib/prompts";
import { structuredCompletion } from "@/lib/structured";
import { HousePlanSchema } from "@/lib/types";

export const maxDuration = 300;

const RequestSchema = z.object({
  plan: HousePlanSchema,
  style: z.string(),
  // Renders the homeowner chose, so the furniture matches what they picked.
  images: z
    .array(z.object({ roomId: z.string().nullable(), title: z.string(), dataUrl: z.string().startsWith("data:image/") }))
    .max(8),
});

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { plan, style, images } = parsed.data;

  if (isMockMode()) {
    return Response.json({ items: defaultFurniture(plan), source: "default", mock: true });
  }

  const roomImages = images.filter((img) => img.roomId);
  const labelFor = (img: (typeof images)[number]) => {
    const room = plan.rooms.find((r) => r.id === img.roomId);
    return room ? `${room.name} (id ${room.id})` : img.title;
  };

  try {
    const result = await structuredCompletion(FurnishSchema, "furniture_layout", [
      { role: "system", content: FURNISH_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: furnishUserText(describeRoomsForFurnishing(plan), style, roomImages.map(labelFor)) },
          ...roomImages.map((img) => ({ type: "image_url" as const, image_url: { url: img.dataUrl } })),
        ],
      },
    ]);
    const items = normalizeFurniture(plan, result.items);
    if (!items.length) {
      return Response.json({ items: defaultFurniture(plan), source: "default", mock: false });
    }
    return Response.json({ items, source: "ai", mock: false });
  } catch (error) {
    console.error("furnish failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
