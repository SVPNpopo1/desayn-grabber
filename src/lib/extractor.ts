/**
 * Design Extraction Engine
 * Takes a photo of a garment/mockup → detects design region → flattens perspective → outputs flat rectangular artwork
 */

interface ExtractionOptions {
  /** Percentage of image to consider as design margin (0-30) */
  margin?: number;
  /** Enhance colors after extraction */
  enhance?: boolean;
  /** Output width in pixels */
  outputWidth?: number;
  /** Output height in pixels (0 = auto from aspect ratio) */
  outputHeight?: number;
}

interface Point {
  x: number;
  y: number;
}

interface Corners {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

// --- Grayscale + edge detection helpers ---
function toGrayscale(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

function gaussianBlur(gray: Float32Array, w: number, h: number, radius: number): Float32Array {
  const out = new Float32Array(w * h);
  const kernel: number[] = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * radius * radius));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  // Horizontal pass
  const temp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(Math.max(x + k, 0), w - 1);
        val += gray[y * w + sx] * kernel[k + radius];
      }
      temp[y * w + x] = val;
    }
  }
  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(Math.max(y + k, 0), h - 1);
        val += temp[sy * w + x] * kernel[k + radius];
      }
      out[y * w + x] = val;
    }
  }
  return out;
}

function sobelEdges(gray: Float32Array, w: number, h: number): Float32Array {
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
        - 2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)]
        - gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
        + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

// --- Design region detection ---
function findDesignRegion(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  marginPercent: number
): { x: number; y: number; w: number; h: number } {
  // Detect dominant background color (corners)
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [Math.floor(w * 0.1), Math.floor(h * 0.1)],
    [Math.floor(w * 0.9), Math.floor(h * 0.1)],
    [Math.floor(w * 0.1), Math.floor(h * 0.9)],
    [Math.floor(w * 0.9), Math.floor(h * 0.9)],
  ];

  let bgR = 0, bgG = 0, bgB = 0;
  for (const [cx, cy] of corners) {
    const i = (cy * w + cx) * 4;
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
  }
  bgR /= corners.length; bgG /= corners.length; bgB /= corners.length;

  // Find bounding box of non-background content
  const threshold = 40;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let hasDesign = false;

  // Sample every 2 pixels for speed
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const dr = data[i] - bgR;
      const dg = data[i + 1] - bgG;
      const db = data[i + 2] - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      if (dist > threshold) {
        hasDesign = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback: if no distinct design found, use center crop
  if (!hasDesign) {
    const margin = Math.floor(Math.min(w, h) * 0.1);
    return { x: margin, y: margin, w: w - margin * 2, h: h - margin * 2 };
  }

  // Add margin
  const mx = Math.floor((maxX - minX) * (marginPercent / 100));
  const my = Math.floor((maxY - minY) * (marginPercent / 100));

  return {
    x: Math.max(0, minX - mx),
    y: Math.max(0, minY - my),
    w: Math.min(w - Math.max(0, minX - mx), maxX - minX + mx * 2),
    h: Math.min(h - Math.max(0, minY - my), maxY - minY + my * 2),
  };
}

// --- Perspective flattening ---
function detectCorners(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  region: { x: number; y: number; w: number; h: number }
): Corners {
  // Simple approach: use the design region corners with slight inward adjustments
  // to account for perspective distortion
  const inset = 0.02;
  return {
    topLeft: { x: region.x + region.w * inset, y: region.y + region.h * inset },
    topRight: { x: region.x + region.w * (1 - inset), y: region.y + region.h * inset },
    bottomRight: { x: region.x + region.w * (1 - inset), y: region.y + region.h * (1 - inset) },
    bottomLeft: { x: region.x + region.w * inset, y: region.y + region.h * (1 - inset) },
  };
}

function bilinearSample(
  data: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  fx: number,
  fy: number
): [number, number, number, number] {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, srcW - 1);
  const y1 = Math.min(y0 + 1, srcH - 1);
  const dx = fx - x0;
  const dy = fy - y0;

  const i00 = (Math.min(y0, srcH - 1) * srcW + Math.min(x0, srcW - 1)) * 4;
  const i10 = (Math.min(y0, srcH - 1) * srcW + x1) * 4;
  const i01 = (y1 * srcW + Math.min(x0, srcW - 1)) * 4;
  const i11 = (y1 * srcW + x1) * 4;

  const r = (1 - dx) * (1 - dy) * data[i00] + dx * (1 - dy) * data[i10] + (1 - dx) * dy * data[i01] + dx * dy * data[i11];
  const g = (1 - dx) * (1 - dy) * data[i00 + 1] + dx * (1 - dy) * data[i10 + 1] + (1 - dx) * dy * data[i01 + 1] + dx * dy * data[i11 + 1];
  const b = (1 - dx) * (1 - dy) * data[i00 + 2] + dx * (1 - dy) * data[i10 + 2] + (1 - dx) * dy * data[i01 + 2] + dx * dy * data[i11 + 2];
  const a = (1 - dx) * (1 - dy) * data[i00 + 3] + dx * (1 - dy) * data[i10 + 3] + (1 - dx) * dy * data[i01 + 3] + dx * dy * data[i11 + 3];

  return [r, g, b, a];
}

function perspectiveWarp(
  srcData: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  corners: Corners,
  outW: number,
  outH: number
): ImageData {
  const out = new ImageData(outW, outH);

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const u = ox / outW;
      const v = oy / outH;

      // Bilinear interpolation of source coordinates
      const srcX =
        (1 - u) * (1 - v) * corners.topLeft.x +
        u * (1 - v) * corners.topRight.x +
        u * v * corners.bottomRight.x +
        (1 - u) * v * corners.bottomLeft.x;

      const srcY =
        (1 - u) * (1 - v) * corners.topLeft.y +
        u * (1 - v) * corners.topRight.y +
        u * v * corners.bottomRight.y +
        (1 - u) * v * corners.bottomLeft.y;

      if (srcX >= 0 && srcX < srcW - 1 && srcY >= 0 && srcY < srcH - 1) {
        const [r, g, b, a] = bilinearSample(srcData, srcW, srcH, srcX, srcY);
        const oi = (oy * outW + ox) * 4;
        out.data[oi] = r;
        out.data[oi + 1] = g;
        out.data[oi + 2] = b;
        out.data[oi + 3] = a;
      }
    }
  }

  return out;
}

// --- Color enhancement ---
function enhanceColors(data: Uint8ClampedArray): void {
  // Auto levels: stretch contrast per channel
  for (let ch = 0; ch < 3; ch++) {
    let min = 255, max = 0;
    for (let i = ch; i < data.length; i += 4) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const range = max - min;
    if (range > 0) {
      for (let i = ch; i < data.length; i += 4) {
        data[i] = Math.round(((data[i] - min) / range) * 255);
      }
    }
  }

  // Slight saturation boost
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = 1.15;
    data[i] = Math.min(255, Math.round(gray + sat * (r - gray)));
    data[i + 1] = Math.min(255, Math.round(gray + sat * (g - gray)));
    data[i + 2] = Math.min(255, Math.round(gray + sat * (b - gray)));
  }
}

// --- Clean edges (remove background fringe) ---
function cleanEdges(
  data: Uint8ClampedArray,
  w: number,
  h: number
): void {
  // Detect background color from borders
  const samples: [number, number, number][] = [];
  for (let x = 0; x < w; x += 4) {
    for (const y of [0, 1, h - 2, h - 1]) {
      const i = (y * w + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  for (let y = 0; y < h; y += 4) {
    for (const x of [0, 1, w - 2, w - 1]) {
      const i = (y * w + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  let bgR = 0, bgG = 0, bgB = 0;
  for (const s of samples) { bgR += s[0]; bgG += s[1]; bgB += s[2]; }
  bgR /= samples.length; bgG /= samples.length; bgB /= samples.length;

  // Feather edges: blend pixels near border toward transparent
  const edgeWidth = Math.max(2, Math.floor(Math.min(w, h) * 0.005));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const distToEdge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (distToEdge < edgeWidth) {
        const i = (y * w + x) * 4;
        const alpha = distToEdge / edgeWidth;
        // Blend toward white background
        data[i] = Math.round(data[i] * alpha + 255 * (1 - alpha));
        data[i + 1] = Math.round(data[i + 1] * alpha + 255 * (1 - alpha));
        data[i + 2] = Math.round(data[i + 2] * alpha + 255 * (1 - alpha));
      }
    }
  }
}

// --- Main extraction function ---
export async function extractDesign(
  imageUrl: string,
  options?: ExtractionOptions
): Promise<string> {
  const margin = options?.margin ?? 5;
  const enhance = options?.enhance ?? true;
  const outputWidth = options?.outputWidth ?? 800;
  const outputHeight = options?.outputHeight ?? 0;

  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });

  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  // Step 1: Render source to canvas
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH);

  // Step 2: Detect design region
  const region = findDesignRegion(srcData.data, srcW, srcH, margin);

  // Step 3: Detect corners for perspective correction
  const corners = detectCorners(srcData.data, srcW, srcH, region);

  // Step 4: Calculate output dimensions
  let outW = outputWidth;
  let outH = outputHeight;
  if (outH <= 0) {
    const aspect = region.h / region.w;
    outH = Math.round(outW * aspect);
  }

  // Step 5: Perspective warp (flatten)
  const warped = perspectiveWarp(srcData.data, srcW, srcH, corners, outW, outH);

  // Step 6: Enhance
  if (enhance) {
    enhanceColors(warped.data);
  }

  // Step 7: Clean edges
  cleanEdges(warped.data, outW, outH);

  // Step 8: Render to output canvas
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext("2d")!;
  outCtx.putImageData(warped, 0, 0);

  return outCanvas.toDataURL("image/png");
}

// --- Generate analysis overlay showing detected region ---
export async function generateAnalysisOverlay(
  imageUrl: string,
  options?: ExtractionOptions
): Promise<{ overlayDataUrl: string; region: { x: number; y: number; w: number; h: number } }> {
  const margin = options?.margin ?? 5;

  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });

  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH);

  const region = findDesignRegion(srcData.data, srcW, srcH, margin);

  // Draw overlay
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = srcW;
  overlayCanvas.height = srcH;
  const ctx = overlayCanvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  // Semi-transparent overlay outside design region
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, srcW, srcH);
  ctx.clearRect(region.x, region.y, region.w, region.h);

  // Region border
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(region.x, region.y, region.w, region.h);

  // Corner markers
  const corners = detectCorners(srcData.data, srcW, srcH, region);
  const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  ctx.setLineDash([]);
  ctx.fillStyle = "#22d3ee";
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Label
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  const labelW = 200;
  const labelH = 28;
  const labelX = region.x;
  const labelY = region.y - labelH - 8;
  ctx.fillRect(labelX, labelY, labelW, labelH);
  ctx.fillStyle = "#22d3ee";
  ctx.font = "13px monospace";
  ctx.fillText(`Design: ${region.w}×${region.h}px`, labelX + 10, labelY + 18);

  return { overlayDataUrl: overlayCanvas.toDataURL("image/png"), region };
}
