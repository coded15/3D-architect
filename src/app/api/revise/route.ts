import { z } from "zod";
import { isMockMode } from "@/lib/meta";
import { tidyPlan } from "@/lib/plan";
import { REVISE_SYSTEM_PROMPT, reviseUserText } from "@/lib/prompts";
import { structuredCompletion } from "@/lib/structured";
import { BriefSchema, HousePlanSchema } from "@/lib/types";

export const maxDuration = 120;

const RequestSchema = z.object({
  brief: BriefSchema,
  plan: HousePlanSchema,
  sketches: z.array(z.string().startsWith("data:image/")).max(6),
  answers: z
    .array(z.object({ questionId: z.string(), question: z.string(), answer: z.string().min(1).max(1000) }))
    .min(1)
    .max(10),
});

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { brief, plan, sketches, answers } = parsed.data;

  if (isMockMode()) {
    return Response.json({ plan, mock: true });
  }

  try {
    const revised = await structuredCompletion(HousePlanSchema, "house_plan", [
      { role: "system", content: REVISE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: reviseUserText(JSON.stringify(plan), answers, brief.notes) },
          ...sketches.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ],
      },
    ]);
    return Response.json({ plan: tidyPlan(revised), mock: false });
  } catch (error) {
    console.error("revise failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}
