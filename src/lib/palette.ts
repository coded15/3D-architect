"use client";

export type Palette = { wall: string; floor: string };

// Cheap colour extraction so the 3D model picks up the look of the images the user chose.
export async function paletteFromImage(dataUrl: string): Promise<Palette> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { wall: "#efe8dc", floor: "#c9b79c" };
  ctx.drawImage(img, 0, 0, size, size);
  const avg = (y0: number, y1: number) => {
    const { data } = ctx.getImageData(0, Math.floor(y0 * size), size, Math.max(1, Math.floor((y1 - y0) * size)));
    let r = 0, g = 0, b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return [r / n, g / n, b / n] as const;
  };
  // Upper-middle band reads as wall, bottom band as floor; lighten walls since renders are often shaded.
  return { wall: toHex(lighten(avg(0.2, 0.55), 0.35)), floor: toHex(avg(0.8, 1)) };
}

function lighten([r, g, b]: readonly [number, number, number], amount: number) {
  return [r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount] as const;
}

function toHex([r, g, b]: readonly [number, number, number]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}
