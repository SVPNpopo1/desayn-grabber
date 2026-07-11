import type { ImageSegmenter, ImageSegmenterResult } from "@mediapipe/tasks-vision";

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let segmenterPromise: Promise<ImageSegmenter> | null = null;

async function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const { ImageSegmenter: IS, FilesetResolver } = vision;
      const filesetResolver = await FilesetResolver.forVisionTasks(WASM_CDN);
      return IS.createFromOptions(filesetResolver, {
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
  let segmenter: ImageSegmenter;
  try {
    segmenter = await getSegmenter();
  } catch (err) {
    console.warn("[ai-segment] Failed to load MediaPipe segmenter, falling back to CV:", err);
    return null;
  }

  try {
    const result: ImageSegmenterResult = segmenter.segment(imageData);
    const confMask = result.confidenceMasks?.[0];
    if (!confMask) {
      result.close();
      return null;
    }

    const raw = confMask.getAsFloat32Array();
    const mask = new Uint8Array(imageData.width * imageData.height);

    // MediaPipe selfie_segmenter: 0 = background, >0 = person (foreground).
    // Threshold at 0.5 for clean binary mask.
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

/**
 * Convert HTMLImageElement to ImageData for MediaPipe.
 */
export function imageToImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
