import { z } from "zod";
import { isMockMode } from "@/lib/meta";
import { mockPlan, tidyPlan } from "@/lib/plan";
import { ANALYZE_SYSTEM_PROMPT, analyzeUserText } from "@/lib/prompts";
import { structuredCompletion } from "@/lib/structured";
import { BriefSchema, HousePlanSchema } from "@/lib/types";

export const maxDuration = 120;

const RequestSchema = z.object({
  brief: BriefSchema,
  sketches: z.array(z.string().startsWith("data:image/")).max(6),
});

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { brief, sketches } = parsed.data;

  if (isMockMode()) {
    return Response.json({ plan: mockPlan(brief.style), mock: true });
  }

  try {
    const plan = await structuredCompletion(HousePlanSchema, "house_plan", [
      { role: "system", content: ANALYZE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: analyzeUserText(brief, sketches.length) },
          ...sketches.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ],
      },
    ]);
    return Response.json({ plan: tidyPlan(plan), mock: false });
  } catch (error) {
    console.error("analyze failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
