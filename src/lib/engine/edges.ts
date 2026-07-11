import type { Point, Quad } from "./types";

export function cannyEdges(
  gray: Float32Array,
  w: number,
  h: number,
  lowThresh: number = 30,
  highThresh: number = 80
): Uint8Array {
  // Sobel
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y - 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)]
        - 2 * gray[y * w + (x - 1)] + 2 * gray[y * w + (x + 1)]
        - gray[(y + 1) * w + (x - 1)] + gray[(y + 1) * w + (x + 1)];
      const gy =
        -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)]
        + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
      mag[y * w + x] = Math.sqrt(gx * gx + gy * gy);
      dir[y * w + x] = Math.atan2(gy, gx);
    }
  }

  // Non-maximum suppression
  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const angle = dir[y * w + x];
      const m = mag[y * w + x];
      let n1 = 0, n2 = 0;

      const a = ((angle * 180) / Math.PI + 180) % 180;
      if (a < 22.5 || a >= 157.5) {
        n1 = mag[y * w + (x - 1)];
        n2 = mag[y * w + (x + 1)];
      } else if (a < 67.5) {
        n1 = mag[(y - 1) * w + (x + 1)];
        n2 = mag[(y + 1) * w + (x - 1)];
      } else if (a < 112.5) {
        n1 = mag[(y - 1) * w + x];
        n2 = mag[(y + 1) * w + x];
      } else {
        n1 = mag[(y - 1) * w + (x - 1)];
        n2 = mag[(y + 1) * w + (x + 1)];
      }

      nms[y * w + x] = m >= n1 && m >= n2 ? m : 0;
    }
  }

  // Double threshold + hysteresis
  const strong = new Uint8Array(w * h);
  const weak = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    if (nms[i] >= highThresh) strong[i] = 2;
    else if (nms[i] >= lowThresh) weak[i] = 1;
  }

  // Hysteresis: promote weak connected to strong
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (strong[y * w + x]) continue;
        if (!weak[y * w + x]) continue;

        let hasStrong = false;
        for (let dy = -1; dy <= 1 && !hasStrong; dy++) {
          for (let dx = -1; dx <= 1 && !hasStrong; dx++) {
            if (strong[(y + dy) * w + (x + dx)]) hasStrong = true;
          }
        }
        if (hasStrong) {
          strong[y * w + x] = 2;
          weak[y * w + x] = 0;
          changed = true;
        }
      }
    }
  }

  // Final edge map
  const edges = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    edges[i] = strong[i] === 2 ? 1 : 0;
  }
  return edges;
}

export function harrisCorners(
  gray: Float32Array,
  w: number,
  h: number,
  blockSize: number = 5,
  k: number = 0.04,
  threshold: number = 1000
): Point[] {
  const ix2 = new Float32Array(w * h);
  const iy2 = new Float32Array(w * h);
  const ixy = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = gray[y * w + (x + 1)] - gray[y * w + (x - 1)];
      const gy = gray[(y + 1) * w + x] - gray[(y - 1) * w + x];
      ix2[y * w + x] = gx * gx;
      iy2[y * w + x] = gy * gy;
      ixy[y * w + x] = gx * gy;
    }
  }

  const half = Math.floor(blockSize / 2);
  const response = new Float32Array(w * h);
  let maxResp = 0;

  for (let y = half; y < h - half; y++) {
    for (let x = half; x < w - half; x++) {
      let sxx = 0, syy = 0, sxy = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const idx = (y + dy) * w + (x + dx);
          sxx += ix2[idx];
          syy += iy2[idx];
          sxy += ixy[idx];
        }
      }
      const det = sxx * syy - sxy * sxy;
      const trace = sxx + syy;
      response[y * w + x] = det - k * trace * trace;
      if (response[y * w + x] > maxResp) maxResp = response[y * w + x];
    }
  }

  // Non-maximum suppression with grid
  const gridSize = 10;
  const corners: Point[] = [];
  const used = new Uint8Array(w * h);

  for (let gy = half; gy < h - half; gy += gridSize) {
    for (let gx = half; gx < w - half; gx += gridSize) {
      let bestX = gx, bestY = gy, bestR = 0;
      for (let y = gy; y < Math.min(gy + gridSize, h - half); y++) {
        for (let x = gx; x < Math.min(gx + gridSize, w - half); x++) {
          const r = response[y * w + x];
          if (r > bestR && r > threshold * 0.01) {
            bestR = r;
            bestX = x;
            bestY = y;
          }
        }
      }
      if (bestR > 0 && !used[bestY * w + bestX]) {
        corners.push({ x: bestX, y: bestY });
        used[bestY * w + bestX] = 1;
      }
    }
  }

  return corners;
}

export function fitQuadrilateral(
  corners: Point[],
  imgW: number,
  imgH: number
): Quad | null {
  if (corners.length < 4) return null;

  // Find the 4 extreme corners: top-left, top-right, bottom-right, bottom-left
  // Using angle from centroid approach
  let cx = 0, cy = 0;
  for (const p of corners) { cx += p.x; cy += p.y; }
  cx /= corners.length;
  cy /= corners.length;

  // Sort corners by angle from center
  const sorted = [...corners].sort((a, b) => {
    const aa = Math.atan2(a.y - cy, a.x - cx);
    const ab = Math.atan2(b.y - cy, b.x - cx);
    return aa - ab;
  });

  // Find the 4 most extreme points in each quadrant
  let best: Quad | null = null;
  let bestArea = 0;

  // Try all combinations of 4 corners
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      for (let k = j + 1; k < sorted.length; k++) {
        for (let l = k + 1; l < sorted.length; l++) {
          const pts = [sorted[i], sorted[j], sorted[k], sorted[l]];
          const q = classifyCorners(pts);
          if (!q) continue;
          const area = quadArea(q);
          if (area > bestArea) {
            bestArea = area;
            best = q;
          }
        }
      }
    }
  }

  // Fallback: if no good quad found, use convex hull extremes
  if (!best) {
    best = fitBoxQuad(corners, imgW, imgH);
  }

  return best;
}

function classifyCorners(pts: Point[]): Quad | null {
  if (pts.length !== 4) return null;

  // Sort by y, then x to find top-left, top-right, bottom-left, bottom-right
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bot = sorted.slice(2, 4).sort((a, b) => a.x - b.x);

  return {
    topLeft: top[0],
    topRight: top[1],
    bottomLeft: bot[0],
    bottomRight: bot[1],
  };
}

function quadArea(q: Quad): number {
  // Shoelace formula
  const pts = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function fitBoxQuad(corners: Point[], w: number, h: number): Quad {
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    topLeft: { x: minX, y: minY },
    topRight: { x: maxX, y: minY },
    bottomRight: { x: maxX, y: maxY },
    bottomLeft: { x: minX, y: maxY },
  };
}

export function cornersFromBoundingBox(
  rect: { x: number; y: number; w: number; h: number }
): Quad {
  return {
    topLeft: { x: rect.x, y: rect.y },
    topRight: { x: rect.x + rect.w, y: rect.y },
    bottomRight: { x: rect.x + rect.w, y: rect.y + rect.h },
    bottomLeft: { x: rect.x, y: rect.y + rect.h },
  };
}
