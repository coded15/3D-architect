import "server-only";
import OpenAI from "openai";

export const META_BASE_URL = process.env.META_BASE_URL ?? "https://api.meta.ai/v1";
export const TEXT_MODEL = process.env.META_TEXT_MODEL ?? "muse-spark-1.3";
export const IMAGE_MODEL = process.env.META_IMAGE_MODEL ?? "muse-image-1.0";

// Without a key the API routes return deterministic mock data so the UI can be developed offline.
export const isMockMode = () => !process.env.MODEL_API_KEY || process.env.MOCK_AI === "1";

let client: OpenAI | null = null;

export function metaClient(): OpenAI {
  if (!process.env.MODEL_API_KEY) {
    throw new Error("MODEL_API_KEY is not set");
  }
  client ??= new OpenAI({ baseURL: META_BASE_URL, apiKey: process.env.MODEL_API_KEY });
  return client;
}

type ResponseOutputItem = { type: string; result?: string | null };

export function extractImageBase64(output: ResponseOutputItem[] | undefined): string | null {
  const call = output?.find((item) => item.type === "image_generation_call" && item.result);
  return call?.result ?? null;
}

// Muse Image returns base64 without a mime type; sniff the magic bytes so the browser can render it.
export function base64ToDataUrl(b64: string): string {
  const head = b64.slice(0, 16);
  let mime = "image/webp";
  if (head.startsWith("iVBOR")) mime = "image/png";
  else if (head.startsWith("/9j/")) mime = "image/jpeg";
  return `data:${mime};base64,${b64}`;
}
