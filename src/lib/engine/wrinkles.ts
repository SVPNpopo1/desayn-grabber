import { gaussianBlur } from "./preprocess";

export function removeWrinkles(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  strength: number = 0.7
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);

  // Extract channels
  const r = new Float32Array(w * h);
  const g = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  const lum = new Float32Array(w * h);

  for (let i = 0; i < w * h; i++) {
    r[i] = data[i * 4];
    g[i] = data[i * 4 + 1];
    b[i] = data[i * 4 + 2];
    lum[i] = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
  }

  // Edge-preserving smoothing using iterative bilateral-like filter
  const smoothed = new Float32Array(lum);
  const radius = 3;
  const sigmaSpace = 4;
  const sigmaRange = 25;

  for (let iter = 0; iter < 3; iter++) {
    const prev = new Float32Array(smoothed);
    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        const center = prev[y * w + x];
        let sumW = 0;
        let sumV = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const neighbor = prev[(y + dy) * w + (x + dx)];
            const spatialDist = (dx * dx + dy * dy) / (2 * sigmaSpace * sigmaSpace);
            const rangeDist = (neighbor - center) * (neighbor - center) / (2 * sigmaRange * sigmaRange);
            const weight = Math.exp(-spatialDist - rangeDist);
            sumW += weight;
            sumV += weight * neighbor;
          }
        }
        smoothed[y * w + x] = sumV / sumW;
      }
    }
  }

  // Compute edge map from original
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = lum[y * w + (x + 1)] - lum[y * w + (x - 1)];
      const gy = lum[(y + 1) * w + x] - lum[(y - 1) * w + x];
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Normalize edges
  let maxEdge = 0;
  for (let i = 0; i < w * h; i++) {
    if (edges[i] > maxEdge) maxEdge = edges[i];
  }
  if (maxEdge > 0) {
    for (let i = 0; i < w * h; i++) edges[i] /= maxEdge;
  }

  // Blend: use smoothed in low-edge areas, original in high-edge areas
  for (let i = 0; i < w * h; i++) {
    const edgeWeight = Math.pow(edges[i], 0.5);
    const blendFactor = strength * (1 - edgeWeight);

    const newLum = lum[i] * (1 - blendFactor) + smoothed[i] * blendFactor;

    // Apply luminance change to RGB proportionally
    const ratio = newLum / Math.max(lum[i], 1);
    out[i * 4] = Math.min(255, Math.max(0, Math.round(r[i] * ratio)));
    out[i * 4 + 1] = Math.min(255, Math.max(0, Math.round(g[i] * ratio)));
    out[i * 4 + 2] = Math.min(255, Math.max(0, Math.round(b[i] * ratio)));
  }

  return out;
}

export function removeLightingGradient(
  data: Uint8ClampedArray,
  w: number,
  h: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);

  // Compute luminance
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Compute mean luminance
  let totalLum = 0;
  for (let i = 0; i < w * h; i++) totalLum += lum[i];
  const meanLum = totalLum / (w * h);

  // Estimate gradient using least-squares plane fit
  // z = a*x + b*y + c
  let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xf = x / w;
      const yf = y / h;
      const z = lum[y * w + x];
      sx += xf; sy += yf; sz += z;
      sxx += xf * xf; syy += yf * yf; sxy += xf * yf;
      sxz += xf * z; syz += yf * z;
    }
  }
  const n = w * h;
  const det = n * (sxx * syy - sxy * sxy) - sx * (sx * syy - sy * sxy) + sy * (sx * sxy - sy * sxx);

  if (Math.abs(det) < 1e-10) return out;

  const a = (sz * (sxx * syy - sxy * sxy) - sx * (sxz * syy - sy * sxy) + sy * (sxz * sxy - sy * sxx)) / det;
  const b = (n * (sxz * syy - syz * sxy) - sx * (sz * syy - sy * syz) + sy * (sz * sxy - sy * sxz)) / det;
  const c = (n * (sxx * syz - sxy * sxz) - sx * (sx * syz - sy * sxz) + sy * (sx * sxy - sy * sxx)) / det;

  // Subtract gradient from each channel
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xf = x / w;
      const yf = y / h;
      const gradientLum = a * xf + b * yf + c;
      const correction = meanLum - gradientLum;

      const i = (y * w + x) * 4;
      out[i] = Math.min(255, Math.max(0, Math.round(data[i] + correction)));
      out[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] + correction)));
      out[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] + correction)));
    }
  }

  return out;
}
