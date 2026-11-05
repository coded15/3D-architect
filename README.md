# 3D-architect

From a rough hand-drawn floor plan to a home everyone can see, before a single brick is laid. Built for the Meta Global AI Developer Hackathon 2026 (Indie Developer Track · Build for Your World).

[![3D-architect demo video](https://img.youtube.com/vi/m6icz-Cf_Sc/maxresdefault.jpg)](https://youtu.be/1cSg1A4Hz38)

🎥 **Demo video:** https://youtu.be/1cSg1A4Hz38

## Why

For most Indian families a home is built once in a lifetime, yet the plan usually lives on a rough sketch. Homeowners can't picture it, builders interpret it their own way, and the mismatch only shows once the walls are up. 3D-architect gives the family, the architect and the builder one shared picture to agree on. Anyone can start a project: a homeowner showing a builder "build this", or an architect sharing a vision with a family.

## Flow

1. **Sketch**: upload a photo of a hand-drawn plan and add plot size, facing, style and notes (any language).
2. **Plan**: Muse Spark reads the sketch, including handwritten labels and feet-inch sizes, into a structured floor plan of rooms, doors and windows. Room sizes are kept as drawn and can be corrected in a table.
3. **Questions**: the app checks the plan for dead-end corridors, rooms with no way in and space it had to fill. Muse Spark then asks plain-language multiple-choice questions instead of guessing, and revises the plan from your answers. The review repeats until nothing is unclear.
4. **Looks**: Muse Image renders the front elevation and each room in your style, using the sketch as a reference. Pick a favourite per part or change it in your own words ("add a brass diya at the pooja corner").
5. **3D**: the plan becomes a 3D house with shared walls, doors and windows. Step through construction stages (site marking → foundation → columns → brickwork → slab → plaster → finishing). Wall and floor colours come from the chosen renders.
6. **Furnish and tour**: Muse Spark studies the chosen renders and places matching furniture in every room, clear of doorways and with backs to walls. Walk through the house in first person (WASD) or take a guided tour room by room.

## Meta models

| Model                                                   | Used for                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Muse Spark (`muse-spark-1.3`, `reasoning_effort: high`) | Reading the sketch, reviewing the plan and asking questions, revising the plan from answers, placing furniture (vision + structured JSON output) |
| Muse Image (`muse-image-1.0`)                           | Elevation and room renders guided by the sketch, plain-language edits via `previous_response_id`                                                 |

All calls go through the Meta Model API (`https://api.meta.ai/v1`) with the OpenAI-compatible SDK, from server-side route handlers so the API key never reaches the browser.

## Getting started

```bash
npm install
cp .env.example .env.local   # add MODEL_API_KEY, or leave empty for mock mode
npm run dev
```

Open http://localhost:3000. Without `MODEL_API_KEY`, the API routes return a sample plan, placeholder images and a standard furniture layout, so the UI works offline.

## Project structure

| Path                   | Purpose                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `src/app/api/analyze`  | Sketch + notes → `HousePlan` JSON (Muse Spark)                                            |
| `src/app/api/review`   | Plan + sketch → clarifying questions (Muse Spark)                                         |
| `src/app/api/revise`   | Plan + answers → revised plan (Muse Spark)                                                |
| `src/app/api/render`   | Elevation and room images, and edits (Muse Image)                                         |
| `src/app/api/furnish`  | Plan + chosen renders → furniture layout (Muse Spark)                                     |
| `src/app/api/sam3d`    | Proxy to an optional self-hosted SAM 3D Objects server                                    |
| `src/lib/types.ts`     | Plan and question schemas (zod), shared by the API and UI                                 |
| `src/lib/plan.ts`      | Cleanup of model output: snap rooms together, fill leftover space, remove duplicate doors |
| `src/lib/planCheck.ts` | Connections, reachability and dead-end checks used by the review                          |
| `src/lib/house3d.ts`   | Plan → walls, openings, slabs and construction stages                                     |
| `src/lib/furniture.ts` | Furniture validation and 3D shapes                                                        |
| `src/lib/tour.ts`      | Guided tour route through doorways                                                        |
| `src/components`       | Step UIs, 2D plan (SVG), 3D viewer with walk and tour modes (React Three Fiber)           |

Project state is stored in the browser (IndexedDB).

## SAM 3D

[SAM 3D Objects](https://github.com/facebookresearch/sam-3d-objects) has no hosted API and needs an NVIDIA GPU with 32 GB+ VRAM. Run it on a GPU host and expose `POST { image } -> { glb }`, then set `SAM3D_ENDPOINT_URL` to enable the "Turn an image into a 3D object" panel.
