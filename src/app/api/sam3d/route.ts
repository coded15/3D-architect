import { connection } from "next/server";
import { z } from "zod";

export const maxDuration = 300;

const RequestSchema = z.object({
  image: z.string().startsWith("data:image/"),
});

// Proxies to a self-hosted SAM 3D Objects server (needs a 32 GB+ NVIDIA GPU, so it can't run inside this app).
// Contract: POST { image: dataUrl } -> { glb: base64 }.
export async function POST(request: Request) {
  const endpoint = process.env.SAM3D_ENDPOINT_URL;
  if (!endpoint) {
    return Response.json(
      { error: "SAM 3D is not configured. Set SAM3D_ENDPOINT_URL to a running SAM 3D server." },
      { status: 501 },
    );
  }

  const parsed = RequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SAM3D_API_KEY ? { Authorization: `Bearer ${process.env.SAM3D_API_KEY}` } : {}),
      },
      body: JSON.stringify({ image: parsed.data.image }),
      signal: AbortSignal.timeout(290_000),
    });
    if (!res.ok) {
      return Response.json({ error: `SAM 3D server returned ${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as { glb?: string };
    if (!data.glb) {
      return Response.json({ error: "SAM 3D server did not return a GLB" }, { status: 502 });
    }
    return Response.json({ dataUrl: `data:model/gltf-binary;base64,${data.glb}` });
  } catch (error) {
    console.error("sam3d failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
}

export async function GET() {
  // Opt out of build-time prerendering so the env check reflects the running server.
  await connection();
  return Response.json({ enabled: Boolean(process.env.SAM3D_ENDPOINT_URL) });
}
