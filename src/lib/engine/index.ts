import type {
  PipelineOptions,
  PipelineResult,
  PipelineStep,
  Quad,
} from "./types";
import {
  bufferToGrayscale,
  gaussianBlur,
} from "./preprocess";
import {
  floodFillBackground,
  findDesignBoundingBox,
  dilateMask,
  erodeMask,
} from "./detect";
import {
  cannyEdges,
  harrisCorners,
  fitQuadrilateral,
  cornersFromBoundingBox,
} from "./edges";
import { warpPerspective } from "./homography";
import { removeWrinkles, removeLightingGradient } from "./wrinkles";
import { inpaintMissing } from "./inpaint";
import {
  autoWhiteBalance,
  autoLevels,
  normalizeSaturation,
  clahe,
} from "./color";
import {
  autoCrop,
  generateAlphaMask,
  flattenToWhiteBackground,
  imageBufferToDataURL,
} from "./render";

const MAX_DIM = 800;

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

function rgbaToFloatGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  return rgbaToGrayscale(data, w, h);
}

export async function extractDesign(
  imageSrc: string,
  options?: Partial<PipelineOptions>,
  onProgress?: (step: string, progress: number) => void
): Promise<PipelineResult> {
  const opts: PipelineOptions = {
    maxColors: options?.maxColors ?? 24,
    edgeStrength: options?.edgeStrength ?? 0.5,
    wrinkleRemoval: options?.wrinkleRemoval ?? 0.7,
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

  // 1. Preprocessing (already downscaled)
  await runStep("Preprocessing", () => {}, [0, 0.1])();

  // 2. Denoise (Gaussian blur on grayscale, applied back to RGBA)
  if (opts.denoise) {
    await runStep("Denoising", () => {
      const gray = rgbaToGrayscale(data, w, h);
      const blurred = gaussianBlur(gray, w, h, 1.5);
      for (let i = 0; i < w * h; i++) {
        const factor = blurred[i] / Math.max(gray[i], 1);
        data[i * 4] = Math.min(255, Math.max(0, Math.round(data[i * 4] * factor)));
        data[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(data[i * 4 + 1] * factor)));
        data[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(data[i * 4 + 2] * factor)));
      }
    }, [0.1, 0.2])();
  }

  // 3. Detect design region
  let mask: Uint8Array | null = null;
  let bbox: { x: number; y: number; w: number; h: number } | null = null;

  await runStep("Detecting design", () => {
    mask = floodFillBackground(data, w, h, 30);
    mask = erodeMask(mask, w, h, 2);
    mask = dilateMask(mask, w, h, 3);
    bbox = findDesignBoundingBox(mask, w, h);
    steps[steps.length - 1].details = bbox
      ? `Found design at (${bbox.x}, ${bbox.y}) ${bbox.w}x${bbox.h}`
      : "No design detected";
  }, [0.2, 0.35])();

  if (!bbox) {
    return {
      success: false,
      error: "No design region detected",
      steps,
      processingTime: performance.now() - t0,
    };
  }

  // 4. Edge detection + corner fitting
  let quad: Quad | null = null;

  if (opts.perspectiveCorrection) {
    await runStep("Fitting quadrilateral", () => {
      const gray = rgbaToGrayscale(data, w, h);
      const blurred = gaussianBlur(gray, w, h, 1.0);
      const _edges = cannyEdges(blurred, w, h, 20, 60);

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
        ? `Quad: ${Math.round(quad.topLeft.x)},${Math.round(quad.topLeft.y)} → ${Math.round(quad.topRight.x)},${Math.round(quad.topRight.y)} → ${Math.round(quad.bottomRight.x)},${Math.round(quad.bottomRight.y)} → ${Math.round(quad.bottomLeft.x)},${Math.round(quad.bottomLeft.y)}`
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

      const warped = warpPerspective(data, w, h, quad!, outW, outH);
      data = new Uint8ClampedArray(warped.data);
      w = outW;
      h = outH;

      // Re-detect mask on warped image
      mask = floodFillBackground(data, w, h, 30);
      mask = erodeMask(mask, w, h, 1);
      mask = dilateMask(mask, w, h, 2);
    }, [0.45, 0.55])();
  }

  // 6. Wrinkle removal
  if (opts.wrinkleRemoval && opts.wrinkleRemoval > 0) {
    await runStep("Removing wrinkles", () => {
      data = new Uint8ClampedArray(removeWrinkles(data, w, h, opts.wrinkleRemoval!));
    }, [0.55, 0.65])();
  }

  // 7. Lighting gradient removal
  await runStep("Removing lighting gradient", () => {
    data = new Uint8ClampedArray(removeLightingGradient(data, w, h));
  }, [0.65, 0.7])();

  // 8. Color correction
  if (opts.colorCorrection) {
    await runStep("Correcting colors", () => {
      data = new Uint8ClampedArray(autoWhiteBalance(data));
      data = new Uint8ClampedArray(autoLevels(data, 0.5));
      data = new Uint8ClampedArray(clahe(data, w, h, 4, 4, 2.0));
      data = new Uint8ClampedArray(normalizeSaturation(data, 1.15));
    }, [0.7, 0.8])();
  }

  // 9. Generate alpha + inpaint
  await runStep("Extracting design", () => {
    const alpha = generateAlphaMask(data, w, h, 235);
    data = new Uint8ClampedArray(inpaintMissing(data, alpha, w, h));
    mask = alpha;
  }, [0.8, 0.88])();

  // 10. Crop
  let cropRect = { x: 0, y: 0, w, h };
  await runStep("Cropping", () => {
    const cropped = autoCrop(data, mask!, w, h, 6);
    if (cropped) {
      data = new Uint8ClampedArray(cropped.data);
      mask = cropped.mask!;
      w = cropped.w;
      h = cropped.h;
      cropRect = { x: cropped.x, y: cropped.y, w: cropped.w, h: cropped.h };
    }
  }, [0.88, 0.92])();

  // 11. Render output
  let outputDataURL: string;
  let outputMaskDataURL: string | undefined;

  await runStep("Rendering output", () => {
    // Flatten to white background (for display)
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
