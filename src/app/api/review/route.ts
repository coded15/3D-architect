import { z } from "zod";
import { isMockMode } from "@/lib/meta";
import { analyzeTopology } from "@/lib/planCheck";
import { REVIEW_SYSTEM_PROMPT, reviewUserText } from "@/lib/prompts";
import { structuredCompletion } from "@/lib/structured";
import { BriefSchema, HousePlanSchema, ReviewSchema, type ClarifyingQuestion } from "@/lib/types";

export const maxDuration = 120;

const RequestSchema = z.object({
  brief: BriefSchema,
  plan: HousePlanSchema,
  sketches: z.array(z.string().startsWith("data:image/")).max(6),
});

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }
  const { brief, plan, sketches } = parsed.data;
  const topology = analyzeTopology(plan);

  if (isMockMode()) {
    return Response.json({ questions: mockQuestions(topology.issues), issues: topology.issues, mock: true });
  }

  try {
    const review = await structuredCompletion(ReviewSchema, "plan_review", [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: reviewUserText(
              JSON.stringify(plan),
              topology.connections,
              topology.issues.map((i) => i.message),
              brief.notes,
            ),
          },
          ...sketches.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ],
      },
    ]);
    return Response.json({ questions: review.questions, issues: topology.issues, mock: false });
  } catch (error) {
    console.error("review failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}

function mockQuestions(issues: ReturnType<typeof analyzeTopology>["issues"]): ClarifyingQuestion[] {
  return issues.slice(0, 3).map((issue, i) => ({
    id: `q${i + 1}`,
    question: issue.kind === "dead_end" ? "This corridor ends in a wall. What should happen here?" : "What is this space on your sketch?",
    context: issue.message,
    options: ["Make it part of the neighbouring room", "Remove it", "Turn it into a storage nook"],
    roomIds: issue.roomIds,
  }));
}
