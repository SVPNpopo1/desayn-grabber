import type {
  PipelineOptions,
  PipelineResult,
  PipelineStep,
  Quad,
} from "./types";
import { gaussianBlur } from "./preprocess";
import {
  floodFillBackground,
  findDesignBoundingBox,
  dilateMask,
  erodeMask,
} from "./detect";
import {
  harrisCorners,
  fitQuadrilateral,
  cornersFromBoundingBox,
} from "./edges";
import { warpPerspective } from "./homography";
import { removeWrinkles, removeLightingGradient } from "./wrinkles";
import {
  autoWhiteBalance,
  autoLevels,
  normalizeSaturation,
} from "./color";
import {
  autoCrop,
  generateAlphaMask,
  flattenToWhiteBackground,
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

/** Proper per-channel Gaussian blur — preserves color */
function denoiseRGBA(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);

  // Build 1D kernel
  const kernel: number[] = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * radius * radius));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  // Temp buffer for horizontal pass
  const temp = new Float32Array(w * h * 4);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(Math.max(x + k, 0), w - 1);
        const idx = (y * w + sx) * 4;
        const weight = kernel[k + radius];
        r += data[idx] * weight;
        g += data[idx + 1] * weight;
        b += data[idx + 2] * weight;
      }
      const oi = (y * w + x) * 4;
      temp[oi] = r;
      temp[oi + 1] = g;
      temp[oi + 2] = b;
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(Math.max(y + k, 0), h - 1);
        const idx = (sy * w + x) * 4;
        const weight = kernel[k + radius];
        r += temp[idx] * weight;
        g += temp[idx + 1] * weight;
        b += temp[idx + 2] * weight;
      }
      const oi = (y * w + x) * 4;
      out[oi] = clampByte(r);
      out[oi + 1] = clampByte(g);
      out[oi + 2] = clampByte(b);
      out[oi + 3] = data[oi + 3]; // preserve alpha
    }
  }

  return out;
}

/** Detect background by sampling border pixels, return thresholded mask */
function detectBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance: number = 45
): Uint8Array {
  // Sample background color from border (2px ring)
  const samples: [number, number, number][] = [];
  for (let x = 0; x < w; x += 2) {
    for (const y of [0, 1, h - 2, h - 1]) {
      const i = (y * w + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  for (let y = 0; y < h; y += 2) {
    for (const x of [0, 1, w - 2, w - 1]) {
      const i = (y * w + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  // K-means-lite: find dominant color cluster
  // Simple approach: average all border samples
  let bgR = 0, bgG = 0, bgB = 0;
  for (const s of samples) { bgR += s[0]; bgG += s[1]; bgB += s[2]; }
  bgR /= samples.length;
  bgG /= samples.length;
  bgB /= samples.length;

  // Threshold: 1 = design (foreground), 0 = background
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    mask[i] = dist > tolerance ? 1 : 0;
  }

  return mask;
}

/** Check what fraction of border pixels are "background" — if too little, no clear bg */
function borderBgFraction(mask: Uint8Array, w: number, h: number): number {
  let total = 0;
  let bg = 0;
  for (let x = 0; x < w; x++) {
    if (!mask[x]) bg++;           // top row
    if (!mask[(h - 1) * w + x]) bg++; // bottom row
    total += 2;
  }
  for (let y = 0; y < h; y++) {
    if (!mask[y * w]) bg++;       // left col
    if (!mask[y * w + w - 1]) bg++; // right col
    total += 2;
  }
  return bg / total;
}

/** Generate alpha mask based on edge saliency, not color threshold */
function edgeBasedAlpha(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bgMask: Uint8Array | null
): Uint8Array {
  const alpha = new Uint8Array(w * h);

  if (bgMask) {
    // Dilate the bg mask to soften edges
    const dilated = new Uint8Array(w * h);
    const r = 3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (bgMask[y * w + x]) {
          // Mark this pixel and neighbors as bg
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                const fade = Math.max(0, 1 - dist / r);
                const idx = ny * w + nx;
                // Fade alpha at edges of bg
                const existing = alpha[idx];
                const newVal = Math.round(255 * fade);
                alpha[idx] = Math.max(existing, newVal > 200 ? 0 : 255);
              }
            }
          }
        }
      }
    }

    // Directly set: bg pixels = 0, non-bg = 255
    for (let i = 0; i < w * h; i++) {
      alpha[i] = bgMask[i] ? 0 : 255;
    }

    // Smooth the alpha edge
    const smoothed = gaussianBlur(
      new Float32Array(alpha),
      w, h, 2
    );
    for (let i = 0; i < w * h; i++) {
      const v = smoothed[i];
      if (bgMask[i]) {
        alpha[i] = v < 128 ? 0 : 255;
      } else {
        alpha[i] = v > 128 ? 255 : 0;
      }
    }
  } else {
    // No background detected — all opaque
    alpha.fill(255);
  }

  return alpha;
}

export async function extractDesign(
  imageSrc: string,
  options?: Partial<PipelineOptions>,
  onProgress?: (step: string, progress: number) => void
): Promise<PipelineResult> {
  const opts: PipelineOptions = {
    maxColors: options?.maxColors ?? 24,
    edgeStrength: options?.edgeStrength ?? 0.5,
    wrinkleRemoval: options?.wrinkleRemoval ?? 0.5,
    perspectiveCorrection: options?.perspectiveCorrection ?? true,
    backgroundRemoval: options?.backgroundRemoval ?? true,
    colorCorrection: options?.colorCorrection ?? true,
    denoise: options?.denoise ?? true,
    outputFormat: options?.outputFormat ?? "png",
    outputQuality: options?.outputQuality ?? 0.95,
    outputWidth: options?.outputWidth ?? 2000,
    outputHeight: options?.outputHeight ?? 2000,
  };

  const steps: PipelineStep[] = [];
  const t0 = performance.now();
  let imgEl: HTMLImageElement;

  try {
    imgEl = await loadImage(imageSrc);
  } catch {
    return {
      success: false,
      error: "Failed to load image",
      steps: [],
      processingTime: 0,
    };
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
    steps.push({
      name,
      duration: performance.now() - t1,
      inputDimensions: { w, h },
    });
    onProgress?.(name, progress[1]);
  };

  // 1. Preprocessing
  await runStep("Preprocessing", () => {}, [0, 0.1])();

  // 2. Denoise — proper per-channel blur, preserves color
  if (opts.denoise) {
    await runStep("Denoising", () => {
      data = new Uint8ClampedArray(denoiseRGBA(data, w, h, 1));
    }, [0.1, 0.2])();
  }

  // 3. Detect background
  let bgMask: Uint8Array | null = null;
  let mask: Uint8Array | null = null;
  let bbox: { x: number; y: number; w: number; h: number } | null = null;

  await runStep("Detecting design", () => {
    if (opts.backgroundRemoval) {
      bgMask = detectBackground(data, w, h, 45);
      const bgFraction = borderBgFraction(bgMask, w, h);

      // Only use bg detection if >30% of border is background
      if (bgFraction > 0.3) {
        // Create foreground mask (inverse of bg)
        mask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) mask[i] = bgMask![i] ? 0 : 1;
        mask = erodeMask(mask, w, h, 1);
        mask = dilateMask(mask, w, h, 2);
      } else {
        // No clear background — treat entire image as design
        bgMask = null;
        mask = new Uint8Array(w * h);
        mask.fill(1);
      }
    } else {
      mask = new Uint8Array(w * h);
      mask.fill(1);
    }

    bbox = findDesignBoundingBox(mask, w, h);
    steps[steps.length - 1].details = bbox
      ? `Found design at (${bbox.x}, ${bbox.y}) ${bbox.w}x${bbox.h}`
      : "Using full image";
  }, [0.2, 0.35])();

  if (!bbox) {
    // Fallback: use full image
    bbox = { x: 0, y: 0, w, h };
  }

  // 4. Edge detection + corner fitting
  let quad: Quad | null = null;

  if (opts.perspectiveCorrection) {
    await runStep("Fitting quadrilateral", () => {
      const gray = rgbaToGrayscale(data, w, h);
      const blurred = gaussianBlur(gray, w, h, 1.0);

      const margin = 10;
      const corners = harrisCorners(blurred, w, h, 7, 0.04, 500);
      const filtered = corners.filter(
        (p) =>
          p.x >= bbox!.x - margin &&
          p.x <= bbox!.x + bbox!.w + margin &&
          p.y >= bbox!.y - margin &&
          p.y <= bbox!.y + bbox!.h + margin
      );

      quad = fitQuadrilateral(filtered, w, h);
      if (!quad) {
        quad = cornersFromBoundingBox(bbox!);
      }
      steps[steps.length - 1].details = quad
        ? `Quad: TL(${Math.round(quad.topLeft.x)},${Math.round(quad.topLeft.y)}) TR(${Math.round(quad.topRight.x)},${Math.round(quad.topRight.y)}) BR(${Math.round(quad.bottomRight.x)},${Math.round(quad.bottomRight.y)}) BL(${Math.round(quad.bottomLeft.x)},${Math.round(quad.bottomLeft.y)})`
        : "Using bounding box";
    }, [0.35, 0.45])();
  }

  // 5. Perspective correction
  if (opts.perspectiveCorrection && quad) {
    await runStep("Correcting perspective", () => {
      const outW = Math.round(
        (Math.max(
          quad!.topRight.x - quad!.topLeft.x,
          quad!.bottomRight.x - quad!.bottomLeft.x
        ) + Math.max(
          quad!.bottomLeft.x - quad!.topLeft.x,
          quad!.bottomRight.x - quad!.topRight.x
        )) / 2
      );
      const outH = Math.round(
        (Math.max(
          quad!.bottomLeft.y - quad!.topLeft.y,
          quad!.bottomRight.y - quad!.topRight.y
        ) + Math.max(
          quad!.topRight.y - quad!.topLeft.y,
          quad!.bottomRight.y - quad!.bottomLeft.y
        )) / 2
      );

      if (outW > 10 && outH > 10) {
        const warped = warpPerspective(data, w, h, quad!, outW, outH);
        data = new Uint8ClampedArray(warped.data);
        w = outW;
        h = outH;

        // Re-detect bg on warped
        if (opts.backgroundRemoval) {
          bgMask = detectBackground(data, w, h, 45);
          const bgFrac = borderBgFraction(bgMask, w, h);
          if (bgFrac > 0.3) {
            mask = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) mask[i] = bgMask![i] ? 0 : 1;
            mask = erodeMask(mask, w, h, 1);
            mask = dilateMask(mask, w, h, 2);
          } else {
            bgMask = null;
            mask = new Uint8Array(w * h);
            mask.fill(1);
          }
        }
      }
    }, [0.45, 0.55])();
  }

  // 6. Wrinkle removal — gentle, preserves color
  if (opts.wrinkleRemoval && opts.wrinkleRemoval > 0) {
    await runStep("Removing wrinkles", () => {
      data = new Uint8ClampedArray(removeWrinkles(data, w, h, opts.wrinkleRemoval!));
    }, [0.55, 0.65])();
  }

  // 7. Lighting gradient removal — gentle
  await runStep("Removing lighting gradient", () => {
    data = new Uint8ClampedArray(removeLightingGradient(data, w, h));
  }, [0.65, 0.7])();

  // 8. Color correction — only if enabled, gentle
  if (opts.colorCorrection) {
    await runStep("Correcting colors", () => {
      data = new Uint8ClampedArray(autoWhiteBalance(data));
      data = new Uint8ClampedArray(autoLevels(data, 0.5));
      data = new Uint8ClampedArray(normalizeSaturation(data, 1.1));
    }, [0.7, 0.8])();
  }

  // 9. Generate alpha mask — based on bg detection, not color threshold
  await runStep("Extracting design", () => {
    mask = edgeBasedAlpha(data, w, h, bgMask);
  }, [0.8, 0.88])();

  // 10. Crop
  let cropRect = { x: 0, y: 0, w, h };
  await runStep("Cropping", () => {
    // Only crop if there's actually background to remove
    if (bgMask) {
      const cropped = autoCrop(data, mask!, w, h, 4);
      if (cropped && cropped.w > 10 && cropped.h > 10) {
        data = new Uint8ClampedArray(cropped.data);
        mask = new Uint8Array(cropped.mask);
        w = cropped.w;
        h = cropped.h;
        cropRect = { x: cropped.x, y: cropped.y, w: cropped.w, h: cropped.h };
      }
    }
  }, [0.88, 0.92])();

  // 11. Render output
  let outputDataURL: string;
  let outputMaskDataURL: string | undefined;

  await runStep("Rendering output", () => {
    // Flatten to white background for display
    const flattened = flattenToWhiteBackground(data, mask!, w, h);
    outputDataURL = imageBufferToDataURL(flattened, w, h, opts.outputFormat, opts.outputQuality);

    // Render with transparency for download
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const imgData = new ImageData(new Uint8ClampedArray(data), w, h);
    ctx.putImageData(imgData, 0, 0);

    if (mask) {
      const alphaCanvas = document.createElement("canvas");
      alphaCanvas.width = w;
      alphaCanvas.height = h;
      const alphaCtx = alphaCanvas.getContext("2d")!;
      const alphaImg = new ImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        alphaImg.data[i * 4] = mask![i];
        alphaImg.data[i * 4 + 1] = mask![i];
        alphaImg.data[i * 4 + 2] = mask![i];
        alphaImg.data[i * 4 + 3] = 255;
      }
      alphaCtx.putImageData(alphaImg, 0, 0);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(alphaCanvas, 0, 0);
    }

    outputMaskDataURL = canvas.toDataURL("image/png");
  }, [0.92, 1.0])();

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
    cropRegion: cropRect,
    maskData: mask || undefined,
  };
}
