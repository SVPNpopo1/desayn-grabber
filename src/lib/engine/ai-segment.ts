/* eslint-disable @typescript-eslint/no-explicit-any */
const VISION_BUNDLE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs";
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

interface Segmenter {
  segment(image: ImageData): { confidenceMasks?: { getAsFloat32Array(): Float32Array; close(): void }[]; close(): void };
  close(): void;
}

let segmenterPromise: Promise<Segmenter> | null = null;

async function loadVisionModule(): Promise<any> {
  // Use Function constructor to bypass Turbopack/Next.js static analysis
  const dynamicImport = new Function("url", "return import(url)") as (url: string) => Promise<any>;
  return dynamicImport(VISION_BUNDLE_URL);
}

async function getSegmenter(): Promise<Segmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await loadVisionModule();
      const filesetResolver = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
      return vision.ImageSegmenter.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })();
  }
  return segmenterPromise;
}

/**
 * AI segmentation using MediaPipe selfie_segmenter.
 * Returns Uint8Array mask: 1 = foreground (person/garment), 0 = background.
 * Falls back to returning null if the model can't load.
 */
export async function aiSegmentForeground(
  imageData: ImageData
): Promise<Uint8Array | null> {
  let segmenter: Segmenter;
  try {
    segmenter = await getSegmenter();
  } catch (err) {
    console.warn("[ai-segment] Failed to load MediaPipe, falling back to CV:", err);
    segmenterPromise = null;
    return null;
  }

  try {
    const result = segmenter.segment(imageData);
    const confMask = result.confidenceMasks?.[0];
    if (!confMask) {
      result.close();
      return null;
    }

    const raw = confMask.getAsFloat32Array();
    const mask = new Uint8Array(imageData.width * imageData.height);

    for (let i = 0; i < mask.length; i++) {
      mask[i] = raw[i] > 0.5 ? 1 : 0;
    }

    confMask.close();
    result.close();
    return mask;
  } catch (err) {
    console.warn("[ai-segment] Segmentation failed:", err);
    return null;
  }
}

export function imageToImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
