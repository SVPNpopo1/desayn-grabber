/**
 * AI segmentation via a Web Worker that loads MediaPipe from CDN.
 * The worker runs independently of the bundler — no Turbopack issues.
 * Falls back to returning null on any failure (triggering CV fallback in pipeline).
 */

let worker: Worker | null = null;
let initPromise: boolean | null = null; // null = not started, true/false = resolved
let initWaiters: ((ok: boolean) => void)[] = [];

let nextId = 0;
const pending = new Map<number, { resolve: (m: Uint8Array | null) => void; timer: ReturnType<typeof setTimeout> }>();

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker("/mp-worker.js");

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;

    if (msg.type === "init") {
      initPromise = msg.success;
      for (const fn of initWaiters) fn(msg.success);
      initWaiters = [];
      if (!msg.success) {
        console.warn("[ai-segment] Worker init failed:", msg.error);
      }
      return;
    }

    if (msg.type === "segment") {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      clearTimeout(p.timer);
      p.resolve(msg.mask);
    }
  };

  worker.onerror = (err) => {
    console.warn("[ai-segment] Worker error:", err);
    initPromise = false;
    for (const fn of initWaiters) fn(false);
    initWaiters = [];
    // Kill and recreate on next attempt
    worker?.terminate();
    worker = null;
  };

  return worker;
}

/**
 * Ensure the worker's MediaPipe segmenter is loaded.
 * Returns true if ready, false on failure. Times out after ms.
 */
async function ensureInit(ms: number): Promise<boolean> {
  if (initPromise === true) return true;
  if (initPromise === false) return false;

  const w = getWorker();
  // Kick off init (idempotent on worker side)
  w.postMessage({ type: "init" });

  return new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => { resolve(ok); };
    initWaiters.push(done);
    setTimeout(() => {
      // Remove ourselves if still waiting
      const idx = initWaiters.indexOf(done);
      if (idx >= 0) initWaiters.splice(idx, 1);
      resolve(false);
    }, ms);
  });
}

/**
 * AI segmentation using MediaPipe selfie_segmenter via Web Worker.
 * Returns Uint8Array mask: 1 = foreground (person/garment), 0 = background.
 * Returns null on any failure (model load timeout, segmentation error).
 */
export async function aiSegmentForeground(
  imageData: ImageData
): Promise<Uint8Array | null> {
  const ready = await ensureInit(12000);
  if (!ready || !worker) return null;

  const id = nextId++;
  const { width, height } = imageData;

  return new Promise<Uint8Array | null>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, 8000);

    pending.set(id, { resolve, timer });

    // Transfer pixel buffer to worker (detaches from main thread)
    worker!.postMessage(
      { type: "segment", id, pixels: imageData.data, width, height },
      [imageData.data.buffer]
    );
  });
}

export function imageToImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
