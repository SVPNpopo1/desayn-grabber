/* eslint-disable @typescript-eslint/no-require-imports */

// imagetracerjs has no TypeScript types
// eslint-disable-next-line
const ImageTracer = require("imagetracerjs");

interface TracerOptions {
  numColors?: number;
  simplify?: number;
  blur?: number;
}

export async function traceImageToSvg(
  imageUrl: string,
  options?: TracerOptions
): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });

  // Scale down large images for speed
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const maxDim = 500;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);

  const numColors = options?.numColors ?? 16;
  const blurR = options?.blur ?? 1;

  const opts: Record<string, unknown> = {
    numberofcolors: numColors,
    blurradius: blurR,
    blurdelta: 20,
    pathomit: 0,
    ltres: 1,
    qtres: 1,
    roundcoords: 1,
    scale: 1,
    strokewidth: 0,
    linefilter: false,
    rightangleenhance: true,
    colorsampling: 2,
    mincolorratio: 0,
    colorquantcycles: 3,
    layering: 0,
    viewbox: false,
    desc: false,
    lcpr: 0,
    qcpr: 0,
  };

  const imgd = ImageTracer.getImgdata(canvas);
  return ImageTracer.imagedataToSVG(imgd, opts);
}
