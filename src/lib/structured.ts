import "server-only";
import type OpenAI from "openai";
import { z } from "zod";
import { metaClient, TEXT_MODEL } from "./meta";

type Messages = OpenAI.Chat.Completions.ChatCompletionMessageParam[];

// Ask Muse Spark for JSON matching `schema`; on a mismatch, feed the errors back once and retry.
export async function structuredCompletion<T extends z.ZodType>(schema: T, name: string, initial: Messages): Promise<z.infer<T>> {
  const messages = [...initial];
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  let lastIssues = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await metaClient().chat.completions.create({
      model: TEXT_MODEL,
      messages,
      response_format: { type: "json_schema", json_schema: { name, schema: jsonSchema } },
    });
    const content = completion.choices[0]?.message?.content ?? "";
    let json: unknown = null;
    try {
      json = JSON.parse(content);
    } catch {
      // handled by schema validation below
    }
    const result = schema.safeParse(json);
    if (result.success) return result.data;
    lastIssues = JSON.stringify(result.error?.issues ?? "Response was not valid JSON").slice(0, 4000);
    messages.push(
      { role: "assistant", content },
      { role: "user", content: `That JSON did not match the schema. Fix these issues and return the full corrected JSON only:\n${lastIssues}` },
    );
  }
  throw new Error(`The model could not produce valid ${name} JSON: ${lastIssues.slice(0, 300)}`);
}
