/* MediaPipe Image Segmenter — Web Worker
   Loads vision_bundle.js from CDN via importScripts (no bundler interference).
   Communicates with main thread via postMessage. */

let vision = null;
let segmenter = null;
let loading = false;

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const BUNDLE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.js";

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === "init") {
    if (segmenter) { self.postMessage({ type: "init", success: true }); return; }
    if (loading) return;
    loading = true;

    try {
      importScripts(BUNDLE_URL);

      // The UMD bundle assigns exports to self (the worker global scope).
      // Try common property names the bundle might use.
      vision = self.ImageSegmenter ? self : (self.vision || self.VisionTasks || null);
      if (!vision || !vision.ImageSegmenter) {
        // Brute-force: scan self for ImageSegmenter
        for (const key of Object.keys(self)) {
          if (self[key] && typeof self[key].ImageSegmenter === "function") {
            vision = self[key];
            break;
          }
        }
      }
      if (!vision || !vision.ImageSegmenter || !vision.FilesetResolver) {
        throw new Error("Could not find ImageSegmenter on global scope after loading bundle");
      }

      const filesetResolver = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
      segmenter = await vision.ImageSegmenter.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "IMAGE",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });

      self.postMessage({ type: "init", success: true });
    } catch (err) {
      self.postMessage({ type: "init", success: false, error: String(err) });
    } finally {
      loading = false;
    }
    return;
  }

  if (msg.type === "segment") {
    const { id, pixels, width, height } = msg;

    if (!segmenter) {
      self.postMessage({ type: "segment", id, mask: null, error: "Not initialized" });
      return;
    }

    try {
      const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
      const result = segmenter.segment(imageData);
      const confMask = result.confidenceMasks && result.confidenceMasks[0];

      if (!confMask) {
        result.close();
        self.postMessage({ type: "segment", id, mask: null });
        return;
      }

      const raw = confMask.getAsFloat32Array();
      const mask = new Uint8Array(width * height);
      for (let i = 0; i < mask.length; i++) {
        mask[i] = raw[i] > 0.5 ? 1 : 0;
      }

      confMask.close();
      result.close();

      // Transfer the mask buffer back
      self.postMessage({ type: "segment", id, mask }, [mask.buffer]);
    } catch (err) {
      self.postMessage({ type: "segment", id, mask: null, error: String(err) });
    }
    return;
  }
};
