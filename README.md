# 3D-architect

From a rough house sketch to images and a 3D model that homeowners, architects, engineers and contractors can all understand. Built for the Meta Global AI Developer Hackathon 2026.

## Flow

1. **Sketch**: upload photos of hand-drawn plans and add plot size, facing, style and notes.
2. **Plan**: Muse Spark (`muse-spark-1.3`) reads the sketch into a structured floor plan (rooms, doors, windows) that you can correct.
3. **Looks**: Muse Image (`muse-image-1.0`) renders each part of the home (front elevation, living room, kitchen…) using the sketch as a reference. Pick a favourite per part or refine it in plain words.
4. **3D**: the plan becomes a 3D model that you can step through by construction stage (site marking → foundation → columns → brickwork → slab → plaster → finishing). Wall and floor colours come from the chosen images. An optional SAM 3D server can turn a chosen image into a 3D object.

## Getting started

```bash
npm install
cp .env.example .env.local   # add MODEL_API_KEY, or leave empty for mock mode
npm run dev
```

Open http://localhost:3000. Without `MODEL_API_KEY`, the API routes return mock plans and placeholder images so the UI can be developed offline.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/app/api/analyze` | Sketch + notes → `HousePlan` JSON via Muse Spark (vision + structured output) |
| `src/app/api/render` | Part images via Muse Image (Responses API; refine with `previous_response_id`) |
| `src/app/api/sam3d` | Proxy to an optional self-hosted SAM 3D Objects server |
| `src/lib/types.ts` | Plan schema (zod), shared by the API and UI |
| `src/lib/house3d.ts` | Plan → 3D building elements and construction stages |
| `src/components` | Step UIs, 2D plan (SVG) and 3D viewers (React Three Fiber) |

Project state is stored in the browser (IndexedDB).

## SAM 3D

[SAM 3D Objects](https://github.com/facebookresearch/sam-3d-objects) has no hosted API and needs an NVIDIA GPU with 32 GB+ VRAM. Run it on a GPU host and expose `POST { image } -> { glb }`, then set `SAM3D_ENDPOINT_URL`.
