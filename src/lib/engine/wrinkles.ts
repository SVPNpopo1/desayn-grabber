import { gaussianBlur } from "./preprocess";

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export function removeWrinkles(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  strength: number = 0.5
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);

  // Extract luminance
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Edge-preserving smoothing on luminance only
  const smoothed = new Float32Array(lum);
  const radius = 2;
  const sigmaSpace = 3;
  const sigmaRange = 30;

  for (let iter = 0; iter < 2; iter++) {
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

  // Compute edge strength
  const edges = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = lum[y * w + (x + 1)] - lum[y * w + (x - 1)];
      const gy = lum[(y + 1) * w + x] - lum[(y - 1) * w + x];
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  let maxEdge = 0;
  for (let i = 0; i < w * h; i++) {
    if (edges[i] > maxEdge) maxEdge = edges[i];
  }
  if (maxEdge > 0) {
    for (let i = 0; i < w * h; i++) edges[i] /= maxEdge;
  }

  // Apply: use ADDITIVE luminance delta (preserves hue/saturation)
  // ratio-based destroys color; additive only changes brightness
  for (let i = 0; i < w * h; i++) {
    const edgeWeight = Math.pow(edges[i], 0.5);
    const blendFactor = strength * (1 - edgeWeight);

    const delta = (smoothed[i] - lum[i]) * blendFactor;

    const oi = i * 4;
    out[oi] = clampByte(data[oi] + delta);
    out[oi + 1] = clampByte(data[oi + 1] + delta);
    out[oi + 2] = clampByte(data[oi + 2] + delta);
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

  // Compute gradient correction, blend at 60% strength
  const strength = 0.6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xf = x / w;
      const yf = y / h;
      const gradientLum = a * xf + b * yf + c;
      const correction = (meanLum - gradientLum) * strength;

      const i = (y * w + x) * 4;
      out[i] = clampByte(data[i] + correction);
      out[i + 1] = clampByte(data[i + 1] + correction);
      out[i + 2] = clampByte(data[i + 2] + correction);
    }
  }

  return out;
}
