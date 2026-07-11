import type {
  PipelineOptions,
  PipelineResult,
  PipelineStep,
  Quad,
} from "./types";
import { gaussianBlur } from "./preprocess";
import {
  warpPerspective,
} from "./homography";
import { removeWrinkles, removeLightingGradient } from "./wrinkles";
import {
  autoWhiteBalance,
  autoLevels,
  normalizeSaturation,
} from "./color";
import {
  imageBufferToDataURL,
} from "./render";

const MAX_DIM = 1200;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function downscale(img: HTMLImageElement): { data: Uint8ClampedArray; w: number; h: number } {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > MAX_DIM || h > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  return { data: imgData.data, w, h };
}

function rgbaToGrayscale(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return gray;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// ============================================================
// Step 2: Detect garment — flood fill from edges to find
// non-garment (background). The garment is the inverse.
// ============================================================
function detectGarment(
  data: Uint8ClampedArray,
  w: number,
  h: number
): { garmentMask: Uint8Array; bgAvg: [number, number, number] } {
  // Sample edge pixels (2px border) to estimate background color
  const edgePixels: [number, number, number][] = [];
  for (let x = 0; x < w; x += 2) {
    for (const y of [0, 1, h - 2, h - 1]) {
      const i = (y * w + x) * 4;
      edgePixels.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  for (let y = 0; y < h; y += 2) {
    for (const x of [0, 1, w - 2, w - 1]) {
      const i = (y * w + x) * 4;
      edgePixels.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  let bgR = 0, bgG = 0, bgB = 0;
  for (const p of edgePixels) { bgR += p[0]; bgG += p[1]; bgB += p[2]; }
  bgR /= edgePixels.length;
  bgG /= edgePixels.length;
  bgB /= edgePixels.length;

  const tolerance = 50;
  const visited = new Uint8Array(w * h);
  const bgMask = new Uint8Array(w * h); // 1 = background

  // BFS flood fill from all edge pixels
  const queue: number[] = [];
  for (let x = 0; x < w; x++) {
    queue.push(x);               // top row
    queue.push((h - 1) * w + x); // bottom row
  }
  for (let y = 0; y < h; y++) {
    queue.push(y * w);         // left col
    queue.push(y * w + w - 1); // right col
  }

  while (queue.length > 0) {
    const idx = queue.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const px = idx * 4;
    const dr = data[px] - bgR;
    const dg = data[px + 1] - bgG;
    const db = data[px + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist > tolerance * 2) continue; // Too different from bg — stop

    bgMask[idx] = 1; // Mark as background

    const x = idx % w;
    const y = (idx - x) / w;

    if (x > 0 && !visited[(y) * w + (x - 1)]) queue.push((y) * w + (x - 1));
    if (x < w - 1 && !visited[(y) * w + (x + 1)]) queue.push((y) * w + (x + 1));
    if (y > 0 && !visited[(y - 1) * w + x]) queue.push((y - 1) * w + x);
    if (y < h - 1 && !visited[(y + 1) * w + x]) queue.push((y + 1) * w + x);
  }

  // Garment = NOT background
  const garmentMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) garmentMask[i] = bgMask[i] ? 0 : 1;

  return { garmentMask, bgAvg: [bgR, bgG, bgB] };
}

// ============================================================
// Step 3: Find garment bounding box and corners
// ============================================================
function findGarmentBounds(mask: Uint8Array, w: number, h: number): {
  bbox: { x: number; y: number; w: number; h: number };
  quad: Quad;
} | null {
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let found = false;

  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (mask[y * w + x]) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return null;

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const bbox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };

  const quad: Quad = {
    topLeft: { x: minX, y: minY },
    topRight: { x: maxX, y: minY },
    bottomRight: { x: maxX, y: maxY },
    bottomLeft: { x: minX, y: maxY },
  };

  return { bbox, quad };
}

// ============================================================
// Step 4: Create alpha from garment mask (feathered edges)
// ============================================================
function garmentToAlpha(
  garmentMask: Uint8Array,
  w: number,
  h: number
): Uint8Array {
  const alpha = new Uint8Array(w * h);

  // Binary mask first
  for (let i = 0; i < w * h; i++) {
    alpha[i] = garmentMask[i] ? 255 : 0;
  }

  // Feather edges with Gaussian blur
  const blurred = gaussianBlur(new Float32Array(alpha), w, h, 3);
  for (let i = 0; i < w * h; i++) {
    alpha[i] = garmentMask[i]
      ? (blurred[i] > 200 ? 255 : blurred[i] > 50 ? Math.round(blurred[i]) : 0)
      : (blurred[i] < 50 ? 0 : Math.round(Math.min(blurred[i], 50)));
  }

  return alpha;
}

// ============================================================
// Main extraction pipeline
// ============================================================
export async function extractDesign(
  imageSrc: string,
  options?: Partial<PipelineOptions>,
  onProgress?: (step: string, progress: number) => void
): Promise<PipelineResult> {
  const opts: PipelineOptions = {
    wrinkleRemoval: options?.wrinkleRemoval ?? 0.4,
    perspectiveCorrection: options?.perspectiveCorrection ?? true,
    backgroundRemoval: options?.backgroundRemoval ?? true,
    colorCorrection: options?.colorCorrection ?? true,
    denoise: options?.denoise ?? true,
    outputFormat: options?.outputFormat ?? "png",
    outputQuality: options?.outputQuality ?? 0.95,
  };

  const steps: PipelineStep[] = [];
  const t0 = performance.now();
  let imgEl: HTMLImageElement;

  try {
    imgEl = await loadImage(imageSrc);
  } catch {
    return { success: false, error: "Failed to load image", steps: [], processingTime: 0 };
  }

  const src = downscale(imgEl);
  let data = new Uint8ClampedArray(src.data);
  let w = src.w;
  let h = src.h;

  const runStep = (
    name: string,
    fn: () => void | Promise<void>,
    progress: [number, number]
  ) => async () => {
    onProgress?.(name, progress[0]);
    const t1 = performance.now();
    await fn();
    steps.push({ name, duration: performance.now() - t1, inputDimensions: { w, h } });
    onProgress?.(name, progress[1]);
  };

  // 1. Load & downscale
  await runStep("Loading image", () => {}, [0, 0.05])();

  // 2. Denoise
  if (opts.denoise) {
    await runStep("Denoising", () => {
      data = new Uint8ClampedArray(denoiseRGBA(data, w, h, 1));
    }, [0.05, 0.15])();
  }

  // 3. Detect garment
  let garmentMask: Uint8Array;
  await runStep("Detecting garment", () => {
    const result = detectGarment(data, w, h);
    garmentMask = result.garmentMask;

    // Count garment vs bg
    let garmentPx = 0;
    for (let i = 0; i < w * h; i++) if (garmentMask[i]) garmentPx++;
    const garmentFrac = garmentPx / (w * h);
    steps[steps.length - 1].details = `Garment: ${(garmentFrac * 100).toFixed(0)}% of image`;

    // If garment < 10% or > 95%, the detection probably failed
    if (garmentFrac < 0.1 || garmentFrac > 0.95) {
      garmentMask = new Uint8Array(w * h);
      garmentMask.fill(1); // Keep everything
      steps[steps.length - 1].details += " (fallback: keeping full image)";
    }
  }, [0.15, 0.3])();

  // 4. Find garment bounds
  let cropQuad: Quad;
  let cropBBox: { x: number; y: number; w: number; h: number };

  await runStep("Finding design area", () => {
    const bounds = findGarmentBounds(garmentMask!, w, h);
    if (!bounds) {
      cropQuad = { topLeft: { x: 0, y: 0 }, topRight: { x: w, y: 0 }, bottomRight: { x: w, y: h }, bottomLeft: { x: 0, y: h } };
      cropBBox = { x: 0, y: 0, w, h };
      steps[steps.length - 1].details = "Using full image";
    } else {
      cropQuad = bounds.quad;
      cropBBox = bounds.bbox;
      steps[steps.length - 1].details = `Design area: ${cropBBox.w}x${cropBBox.h} at (${cropBBox.x}, ${cropBBox.y})`;
    }
  }, [0.3, 0.35])();

  // 5. Perspective correction
  if (opts.perspectiveCorrection) {
    await runStep("Correcting perspective", () => {
      // Use garment bbox as the output dimensions (preserves aspect ratio)
      const outW = cropBBox!.w;
      const outH = cropBBox!.h;

      if (outW > 20 && outH > 20) {
        const warped = warpPerspective(data, w, h, cropQuad!, outW, outH);
        data = new Uint8ClampedArray(warped.data);
        w = outW;
        h = outH;

        // Also warp the garment mask to match
        // (use nearest-neighbor for binary mask)
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = w;
        maskCanvas.height = h;
        const maskCtx = maskCanvas.getContext("2d")!;

        // Draw mask as grayscale
        const maskImg = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) {
          const v = garmentMask![i] ? 255 : 0;
          maskImg.data[i * 4] = v;
          maskImg.data[i * 4 + 1] = v;
          maskImg.data[i * 4 + 2] = v;
          maskImg.data[i * 4 + 3] = 255;
        }

        // Create source canvas for mask
        const srcMaskCanvas = document.createElement("canvas");
        srcMaskCanvas.width = src!.w;
        srcMaskCanvas.height = src!.h;
        const srcMaskCtx = srcMaskCanvas.getContext("2d")!;
        srcMaskCtx.putImageData(maskImg, 0, 0);

        // We need to warp the mask too — use same quad mapping
        // Simple approach: just re-detect from the warped image
        const reDetected = detectGarment(data, w, h);
        garmentMask = reDetected.garmentMask;

        garmentMask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) garmentMask[i] = reDetected.garmentMask[i];
      }
    }, [0.35, 0.5])();
  }

  // 6. Wrinkle removal
  if (opts.wrinkleRemoval && opts.wrinkleRemoval > 0) {
    await runStep("Removing wrinkles", () => {
      data = new Uint8ClampedArray(removeWrinkles(data, w, h, opts.wrinkleRemoval!));
    }, [0.5, 0.6])();
  }

  // 7. Lighting gradient removal
  await runStep("Removing shadows", () => {
    data = new Uint8ClampedArray(removeLightingGradient(data, w, h));
  }, [0.6, 0.65])();

  // 8. Color correction
  if (opts.colorCorrection) {
    await runStep("Enhancing colors", () => {
      data = new Uint8ClampedArray(autoWhiteBalance(data));
      data = new Uint8ClampedArray(autoLevels(data, 0.5));
      data = new Uint8ClampedArray(normalizeSaturation(data, 1.1));
    }, [0.65, 0.75])();
  }

  // 9. Generate alpha mask from garment detection
  let alpha: Uint8Array;
  await runStep("Extracting artwork", () => {
    alpha = garmentToAlpha(garmentMask!, w, h);

    // Verify alpha has non-zero content
    let opaquePx = 0;
    for (let i = 0; i < w * h; i++) if (alpha![i] > 128) opaquePx++;
    const opaqueFrac = opaquePx / (w * h);

    if (opaqueFrac < 0.05) {
      // Alpha is mostly transparent — the garment detection may have failed
      // Fallback: keep everything opaque
      alpha = new Uint8Array(w * h);
      alpha.fill(255);
      steps[steps.length - 1].details = "Fallback: keeping full image (no background removal)";
    } else {
      steps[steps.length - 1].details = `Artwork: ${(opaqueFrac * 100).toFixed(0)}% visible`;
    }
  }, [0.75, 0.85])();

  // 10. Flatten onto white background for display output
  let outputDataURL: string;
  let outputMaskDataURL: string | undefined;

  await runStep("Rendering output", () => {
    // Composite: design * alpha + white * (1-alpha)
    const flat = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const a = alpha![i] / 255;
      const oi = i * 4;
      flat[oi] = clampByte(data[oi] * a + 255 * (1 - a));
      flat[oi + 1] = clampByte(data[oi + 1] * a + 255 * (1 - a));
      flat[oi + 2] = clampByte(data[oi + 2] * a + 255 * (1 - a));
      flat[oi + 3] = 255;
    }
    outputDataURL = imageBufferToDataURL(flat, w, h, opts.outputFormat, opts.outputQuality);

    // Also make a transparent version
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const imgData = new ImageData(new Uint8ClampedArray(data), w, h);
    ctx.putImageData(imgData, 0, 0);

    // Apply alpha
    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = w;
    alphaCanvas.height = h;
    const alphaCtx = alphaCanvas.getContext("2d")!;
    const alphaImg = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      alphaImg.data[i * 4] = alpha![i];
      alphaImg.data[i * 4 + 1] = alpha![i];
      alphaImg.data[i * 4 + 2] = alpha![i];
      alphaImg.data[i * 4 + 3] = 255;
    }
    alphaCtx.putImageData(alphaImg, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(alphaCanvas, 0, 0);
    outputMaskDataURL = canvas.toDataURL("image/png");
  }, [0.85, 1.0])();

  return {
    success: true,
    outputImage: outputDataURL!,
    outputMask: outputMaskDataURL,
    steps,
    processingTime: performance.now() - t0,
    dimensions: {
      input: { w: imgEl.naturalWidth, h: imgEl.naturalHeight },
      output: { w, h },
    },
    maskData: alpha!,
  };
}

// ============================================================
// Denoise helper
// ============================================================
function denoiseRGBA(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const kernel: number[] = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * radius * radius));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const temp = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(Math.max(x + k, 0), w - 1);
        const idx = (y * w + sx) * 4;
        const wt = kernel[k + radius];
        r += data[idx] * wt;
        g += data[idx + 1] * wt;
        b += data[idx + 2] * wt;
      }
      const oi = (y * w + x) * 4;
      temp[oi] = r;
      temp[oi + 1] = g;
      temp[oi + 2] = b;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(Math.max(y + k, 0), h - 1);
        const idx = (sy * w + x) * 4;
        const wt = kernel[k + radius];
        r += temp[idx] * wt;
        g += temp[idx + 1] * wt;
        b += temp[idx + 2] * wt;
      }
      const oi = (y * w + x) * 4;
      out[oi] = clampByte(r);
      out[oi + 1] = clampByte(g);
      out[oi + 2] = clampByte(b);
      out[oi + 3] = data[oi + 3];
    }
  }
  return out;
}
