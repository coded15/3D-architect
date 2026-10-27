import { z } from "zod";
import { ANALYZE_SYSTEM_PROMPT, analyzeUserText } from "@/lib/prompts";
import { isMockMode, metaClient, TEXT_MODEL } from "@/lib/meta";
import { mockPlan, normalizePlan, snapPlan } from "@/lib/plan";
import { HousePlanSchema } from "@/lib/types";

export const maxDuration = 120;

const RequestSchema = z.object({
  brief: z.object({
    title: z.string(),
    plotWidth: z.number().nullable(),
    plotDepth: z.number().nullable(),
    facing: z.enum(["N", "E", "S", "W"]).nullable(),
    floors: z.number().nullable(),
    notes: z.string(),
    style: z.string(),
  }),
  sketches: z.array(z.string().startsWith("data:image/")).max(6),
});

const planJsonSchema = z.toJSONSchema(HousePlanSchema, { target: "draft-7" });

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { brief, sketches } = parsed.data;

  if (isMockMode()) {
    return Response.json({ plan: mockPlan(brief.style), mock: true });
  }

  const messages: Parameters<ReturnType<typeof metaClient>["chat"]["completions"]["create"]>[0]["messages"] = [
    { role: "system", content: ANALYZE_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: analyzeUserText(brief, sketches.length) },
        ...sketches.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ],
    },
  ];

  try {
    const client = metaClient();
    // One repair attempt: feed validation errors back to the model if the first answer doesn't match the schema.
    for (let attempt = 0; attempt < 2; attempt++) {
      const completion = await client.chat.completions.create({
        model: TEXT_MODEL,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: "house_plan", schema: planJsonSchema as Record<string, unknown> },
        },
      });
      const content = completion.choices[0]?.message?.content ?? "";
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        json = null;
      }
      const result = HousePlanSchema.safeParse(json);
      if (result.success) {
        return Response.json({ plan: normalizePlan(snapPlan(normalizePlan(result.data))), mock: false });
      }
      messages.push(
        { role: "assistant", content },
        {
          role: "user",
          content: `That JSON did not match the schema. Fix these issues and return the full corrected JSON only:\n${JSON.stringify(
            result.error?.issues ?? "Response was not valid JSON",
          ).slice(0, 4000)}`,
        },
      );
    }
    return Response.json({ error: "The model could not produce a valid plan. Try a clearer sketch or add notes." }, { status: 502 });
  } catch (error) {
    console.error("analyze failed", error);
    return Response.json({ error: errorMessage(error) }, { status: 502 });
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
