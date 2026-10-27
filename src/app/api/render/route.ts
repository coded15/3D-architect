import { z } from "zod";
import { base64ToDataUrl, extractImageBase64, IMAGE_MODEL, isMockMode, metaClient } from "@/lib/meta";
import { partImagePrompt } from "@/lib/prompts";
import { HousePlanSchema } from "@/lib/types";

export const maxDuration = 180;

const RequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("generate"),
    plan: HousePlanSchema,
    partId: z.string(),
    style: z.string(),
    variantIndex: z.number().int().min(0),
    sketch: z.string().startsWith("data:image/").nullable(),
  }),
  z.object({
    mode: z.literal("refine"),
    previousResponseId: z.string(),
    instruction: z.string().min(1).max(1000),
    title: z.string(),
  }),
]);

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  if (isMockMode()) {
    const label = body.mode === "generate" ? body.plan.parts.find((p) => p.id === body.partId)?.title ?? "View" : body.title;
    const seed = body.mode === "generate" ? body.variantIndex : Date.now();
    return Response.json({ dataUrl: mockImage(label, seed, body.mode === "refine" ? body.instruction : ""), responseId: null, mock: true });
  }

  try {
    const client = metaClient();
    let response;
    if (body.mode === "generate") {
      const part = body.plan.parts.find((p) => p.id === body.partId);
      if (!part) return Response.json({ error: "Unknown part" }, { status: 400 });
      const prompt = partImagePrompt(body.plan, part, body.style, body.variantIndex);
      response = await client.responses.create({
        model: IMAGE_MODEL,
        input: body.sketch
          ? [
              {
                role: "user",
                content: [
                  { type: "input_text", text: prompt },
                  { type: "input_image", image_url: body.sketch, detail: "auto" },
                ],
              },
            ]
          : prompt,
      });
    } else {
      response = await client.responses.create({
        model: IMAGE_MODEL,
        previous_response_id: body.previousResponseId,
        input: body.instruction,
      });
    }

    const b64 = extractImageBase64(response.output as { type: string; result?: string | null }[]);
    if (!b64) {
      return Response.json({ error: "The model did not return an image. Try again." }, { status: 502 });
    }
    return Response.json({ dataUrl: base64ToDataUrl(b64), responseId: response.id, mock: false });
  } catch (error) {
    console.error("render failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}

function mockImage(label: string, seed: number, note: string): string {
  const hues = [28, 200, 140, 330, 260];
  const hue = hues[Math.abs(Math.floor(seed)) % hues.length];
  const escape = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,80%)"/><stop offset="1" stop-color="hsl(${hue + 40},60%,55%)"/></linearGradient></defs>
<rect width="768" height="512" fill="url(#g)"/>
<rect x="120" y="180" width="528" height="250" fill="hsla(0,0%,100%,0.35)" stroke="#fff" stroke-width="4"/>
<polygon points="100,190 384,60 668,190" fill="hsla(0,0%,100%,0.5)"/>
<text x="384" y="300" font-family="sans-serif" font-size="40" text-anchor="middle" fill="#222">${escape(label)}</text>
<text x="384" y="350" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#333">Mock image (set MODEL_API_KEY)</text>
<text x="384" y="390" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#333">${escape(note.slice(0, 60))}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
