export function inpaintMissing(
  data: Uint8ClampedArray,
  mask: Uint8Array,
  w: number,
  h: number
): Uint8ClampedArray {
  if (!mask) return new Uint8ClampedArray(data);

  const out = new Uint8ClampedArray(data);

  // Find holes (mask=0) surrounded by design (mask=1)
  const holeRadius = 8;
  const patchSize = 5;

  // Iteratively fill holes from the outside in
  let filled = true;
  let iterations = 0;

  while (filled && iterations < 10) {
    filled = false;
    iterations++;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x]) continue; // Not a hole

        // Check if this hole pixel is near a filled pixel
        let bestDist = Infinity;
        let bestR = 0, bestG = 0, bestB = 0;
        let foundSource = false;

        for (let dy = -holeRadius; dy <= holeRadius; dy++) {
          for (let dx = -holeRadius; dx <= holeRadius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            if (!mask[ny * w + nx]) continue; // Source must be design

            const dist = dx * dx + dy * dy;
            if (dist < bestDist) {
              bestDist = dist;
              const si = (ny * w + nx) * 4;
              bestR = out[si];
              bestG = out[si + 1];
              bestB = out[si + 2];
              foundSource = true;
            }
          }
        }

        if (foundSource) {
          const oi = (y * w + x) * 4;
          out[oi] = bestR;
          out[oi + 1] = bestG;
          out[oi + 2] = bestB;
          out[oi + 3] = 255;
          filled = true;
        }
      }
    }
  }

  // Smooth the filled regions with a gentle blur
  const smoothed = new Uint8ClampedArray(out);
  const blurR = 2;

  for (let y = blurR; y < h - blurR; y++) {
    for (let x = blurR; x < w - blurR; x++) {
      if (mask[y * w + x]) continue; // Only smooth filled holes

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let count = 0;
        for (let dy = -blurR; dy <= blurR; dy++) {
          for (let dx = -blurR; dx <= blurR; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              sum += out[(ny * w + nx) * 4 + c];
              count++;
            }
          }
        }
        smoothed[(y * w + x) * 4 + c] = Math.round(sum / count);
      }
    }
  }

  return smoothed;
}
