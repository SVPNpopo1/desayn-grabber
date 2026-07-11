export function autoWhiteBalance(data: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);

  // Gray world assumption: average of each channel should be equal
  let rSum = 0, gSum = 0, bSum = 0;
  const n = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }

  const rAvg = rSum / n;
  const gAvg = gSum / n;
  const bAvg = bSum / n;
  const avg = (rAvg + gAvg + bAvg) / 3;

  const rGain = avg / Math.max(rAvg, 1);
  const gGain = avg / Math.max(gAvg, 1);
  const bGain = avg / Math.max(bAvg, 1);

  for (let i = 0; i < data.length; i += 4) {
    out[i] = Math.min(255, Math.round(data[i] * rGain));
    out[i + 1] = Math.min(255, Math.round(data[i + 1] * gGain));
    out[i + 2] = Math.min(255, Math.round(data[i + 2] * bGain));
  }

  return out;
}

export function autoLevels(
  data: Uint8ClampedArray,
  clipPercent: number = 1
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const n = data.length / 4;
  const clipCount = Math.floor(n * clipPercent / 100);

  for (let ch = 0; ch < 3; ch++) {
    // Build histogram
    const hist = new Uint32Array(256);
    for (let i = ch; i < data.length; i += 4) {
      hist[data[i]]++;
    }

    // Find clip points
    let low = 0, high = 255;
    let accumulated = 0;

    for (let i = 0; i < 256; i++) {
      accumulated += hist[i];
      if (accumulated >= clipCount) { low = i; break; }
    }

    accumulated = 0;
    for (let i = 255; i >= 0; i--) {
      accumulated += hist[i];
      if (accumulated >= clipCount) { high = i; break; }
    }

    const range = high - low;
    if (range <= 0) continue;

    for (let i = ch; i < data.length; i += 4) {
      out[i] = Math.min(255, Math.max(0, Math.round(((data[i] - low) / range) * 255)));
    }
  }

  return out;
}

export function normalizeSaturation(
  data: Uint8ClampedArray,
  targetSat: number = 1.1
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);

  // Compute average saturation
  let totalSat = 0;
  const n = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    totalSat += sat;
  }
  const avgSat = totalSat / n;
  const gain = avgSat > 0 ? targetSat / avgSat : 1;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i] = Math.min(255, Math.max(0, Math.round(gray + gain * (r - gray))));
    out[i + 1] = Math.min(255, Math.max(0, Math.round(gray + gain * (g - gray))));
    out[i + 2] = Math.min(255, Math.max(0, Math.round(gray + gain * (b - gray))));
  }

  return out;
}

export function clahe(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tileX: number = 8,
  tileY: number = 8,
  clipLimit: number = 2.0
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);
  const tileW = Math.ceil(w / tileX);
  const tileH = Math.ceil(h / tileY);

  for (let ty = 0; ty < tileY; ty++) {
    for (let tx = 0; tx < tileX; tx++) {
      const startX = tx * tileW;
      const startY = ty * tileH;
      const endX = Math.min(startX + tileW, w);
      const endY = Math.min(startY + tileH, h);

      // Build histogram for this tile (luminance)
      const hist = new Uint32Array(256);
      let count = 0;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const i = (y * w + x) * 4;
          const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          hist[Math.min(255, Math.max(0, lum))]++;
          count++;
        }
      }

      // Clip histogram
      const limit = Math.round(count * clipLimit / 256);
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) {
          excess += hist[i] - limit;
          hist[i] = limit;
        }
      }

      // Redistribute excess
      const avgInc = Math.floor(excess / 256);
      let residual = excess - avgInc * 256;
      for (let i = 0; i < 256; i++) {
        hist[i] += avgInc;
        if (i < residual) hist[i]++;
      }

      // Compute CDF
      const cdf = new Float32Array(256);
      cdf[0] = hist[0];
      for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];

      const cdfMin = cdf.find((v) => v > 0) || 0;
      const range = count - cdfMin;

      // Build LUT
      const lut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        lut[i] = range > 0 ? Math.round(((cdf[i] - cdfMin) / range) * 255) : i;
      }

      // Apply LUT
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const i = (y * w + x) * 4;
          const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          const newLum = lut[Math.min(255, Math.max(0, lum))];
          const ratio = newLum / Math.max(lum, 1);
          out[i] = Math.min(255, Math.max(0, Math.round(data[i] * ratio)));
          out[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] * ratio)));
          out[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] * ratio)));
        }
      }
    }
  }

  return out;
}
