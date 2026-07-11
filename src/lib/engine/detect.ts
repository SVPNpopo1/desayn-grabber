import type { Point, Rect } from "./types";

export function otsuThreshold(gray: Float32Array, w: number, h: number): number {
  const histogram = new Uint32Array(256);
  const total = w * h;

  for (let i = 0; i < total; i++) {
    const bin = Math.min(255, Math.max(0, Math.round(gray[i])));
    histogram[bin]++;
  }

  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let bestThresh = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      bestThresh = t;
    }
  }

  return bestThresh;
}

export function adaptiveThreshold(
  gray: Float32Array,
  w: number,
  h: number,
  blockSize: number = 15,
  c: number = 10
): Uint8Array {
  const mask = new Uint8Array(w * h);
  const half = Math.floor(blockSize / 2);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const nx = Math.min(Math.max(x + dx, 0), w - 1);
          const ny = Math.min(Math.max(y + dy, 0), h - 1);
          sum += gray[ny * w + nx];
          count++;
        }
      }
      const mean = sum / count;
      mask[y * w + x] = gray[y * w + x] > mean - c ? 1 : 0;
    }
  }
  return mask;
}

export function floodFillBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bgThreshold: number = 30
): Uint8Array {
  const visited = new Uint8Array(w * h);
  const mask = new Uint8Array(w * h); // 1 = design, 0 = bg

  // Sample background color from corners
  const cornerSamples = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [Math.floor(w * 0.05), Math.floor(h * 0.05)],
    [Math.floor(w * 0.95), Math.floor(h * 0.05)],
    [Math.floor(w * 0.05), Math.floor(h * 0.95)],
    [Math.floor(w * 0.95), Math.floor(h * 0.95)],
  ];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [cx, cy] of cornerSamples) {
    const i = (cy * w + cx) * 4;
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
  }
  bgR /= cornerSamples.length;
  bgG /= cornerSamples.length;
  bgB /= cornerSamples.length;

  function isBackground(x: number, y: number): boolean {
    if (x < 0 || x >= w || y < 0 || y >= h) return true;
    const idx = (y * w + x) * 4;
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db) < bgThreshold;
  }

  // BFS flood fill from edges
  const queue: [number, number][] = [];
  for (let x = 0; x < w; x++) {
    if (isBackground(x, 0)) queue.push([x, 0]);
    if (isBackground(x, h - 1)) queue.push([x, h - 1]);
  }
  for (let y = 0; y < h; y++) {
    if (isBackground(0, y)) queue.push([0, y]);
    if (isBackground(w - 1, y)) queue.push([w - 1, y]);
  }

  while (queue.length > 0) {
    const [cx, cy] = queue.pop()!;
    const key = cy * w + cx;
    if (visited[key]) continue;
    if (!isBackground(cx, cy)) continue;

    visited[key] = 1;
    // mask[key] stays 0 = background

    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && !visited[ny * w + nx]) {
        queue.push([nx, ny]);
      }
    }
  }

  // Invert: design = 1
  for (let i = 0; i < w * h; i++) {
    mask[i] = visited[i] ? 0 : 1;
  }

  return mask;
}

export function findDesignBoundingBox(
  mask: Uint8Array,
  w: number,
  h: number,
  marginPercent: number = 5
): Rect {
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let found = false;

  // Sample every 2 pixels
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

  if (!found) {
    const m = Math.floor(Math.min(w, h) * 0.1);
    return { x: m, y: m, w: w - m * 2, h: h - m * 2 };
  }

  const mx = Math.floor((maxX - minX) * (marginPercent / 100));
  const my = Math.floor((maxY - minY) * (marginPercent / 100));

  return {
    x: Math.max(0, minX - mx),
    y: Math.max(0, minY - my),
    w: Math.min(w - Math.max(0, minX - mx), maxX - minX + mx * 2),
    h: Math.min(h - Math.max(0, minY - my), maxY - minY + my * 2),
  };
}

export function dilateMask(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number
): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) {
            found = true;
          }
        }
      }
      out[y * w + x] = found ? 1 : 0;
    }
  }
  return out;
}

export function erodeMask(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number
): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let allSet = true;
      for (let dy = -radius; dy <= radius && allSet; dy++) {
        for (let dx = -radius; dx <= radius && allSet; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) {
            allSet = false;
          }
        }
      }
      out[y * w + x] = allSet ? 1 : 0;
    }
  }
  return out;
}

export function maskToPoints(mask: Uint8Array, w: number, h: number): Point[] {
  const points: Point[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) points.push({ x, y });
    }
  }
  return points;
}
