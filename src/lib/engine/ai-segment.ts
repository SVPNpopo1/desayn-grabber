/**
 * AI segmentation module.
 *
 * Uses MediaPipe selfie_segmenter loaded from CDN at runtime.
 * Falls back gracefully to null (triggering CV fallback in the pipeline).
 */

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let loaderPromise: Promise<any> | null = null;
let segmenterPromise: Promise<any> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function loadVisionTasks(): Promise<any> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = (async () => {
    // Load MediaPipe vision bundle into a global via dynamic script injection
    // The bundle registers itself on window when loaded as a classic script
    const bundleUrl =
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.js";

    await new Promise<void>((resolve, reject) => {
      const existing = document.getElementById("mp-vision-bundle");
      if (existing) { resolve(); return; }
      const s = document.createElement("script");
      s.id = "mp-vision-bundle";
      s.src = bundleUrl;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load MediaPipe vision bundle"));
      document.head.appendChild(s);
    });

    // The UMD bundle exposes everything under the global scope
    // Try common global names
    const w = window as any;
    const vision = w.vision || w.Vision || w.mediapipe || w;
    if (!vision?.ImageSegmenter) {
      throw new Error("MediaPipe ImageSegmenter not found on window");
    }
    return vision;
  })();

  return loaderPromise;
}

/**
 * AI segmentation using MediaPipe selfie_segmenter.
 * Returns Uint8Array mask: 1 = foreground (person/garment), 0 = background.
 * Returns null on any failure (model load, timeout, segmentation error).
 */
export async function aiSegmentForeground(
  imageData: ImageData
): Promise<Uint8Array | null> {
  let segmenter: any;

  try {
    if (!segmenterPromise) {
      segmenterPromise = (async () => {
        const vision = await loadVisionTasks();
        const filesetResolver = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
        return vision.ImageSegmenter.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      })();
    }
    segmenter = await withTimeout(segmenterPromise, 8000);
  } catch (err) {
    console.warn("[ai-segment] MediaPipe init failed, falling back to CV:", err);
    loaderPromise = null;
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
