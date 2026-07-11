export function autoCrop(
  data: Uint8ClampedArray,
  mask: Uint8Array,
  w: number,
  h: number,
  padding: number = 4
): { data: Uint8ClampedArray; mask: Uint8Array; x: number; y: number; w: number; h: number } | null {
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let found = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (!found) return null;

  // Add padding
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(w - 1, maxX + padding);
  maxY = Math.min(h - 1, maxY + padding);

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const croppedData = new Uint8ClampedArray(cw * ch * 4);
  const croppedMask = new Uint8Array(cw * ch);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const si = (y * w + x) * 4;
      const di = ((y - minY) * cw + (x - minX)) * 4;
      croppedData[di] = data[si];
      croppedData[di + 1] = data[si + 1];
      croppedData[di + 2] = data[si + 2];
      croppedData[di + 3] = data[si + 3];

      croppedMask[(y - minY) * cw + (x - minX)] = mask[y * w + x];
    }
  }

  return { data: croppedData, mask: croppedMask, x: minX, y: minY, w: cw, h: ch };
}

export function generateAlphaMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number = 240
): Uint8Array {
  const alpha = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    // If pixel is near-white (paper/fabric background), mark transparent
    if (r > threshold && g > threshold && b > threshold) {
      alpha[i] = 0;
    } else {
      alpha[i] = 255;
    }
  }

  return alpha;
}

export function flattenToWhiteBackground(
  data: Uint8ClampedArray,
  alpha: Uint8Array,
  w: number,
  h: number,
  bgColor: [number, number, number] = [255, 255, 255]
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);

  for (let i = 0; i < w * h; i++) {
    const a = alpha[i] / 255;
    const oi = i * 4;
    out[oi] = Math.round(data[oi] * a + bgColor[0] * (1 - a));
    out[oi + 1] = Math.round(data[oi + 1] * a + bgColor[1] * (1 - a));
    out[oi + 2] = Math.round(data[oi + 2] * a + bgColor[2] * (1 - a));
    out[oi + 3] = 255;
  }

  return out;
}

export function imageBufferToDataURL(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  format: "png" | "jpeg" = "png",
  quality: number = 0.95
): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const imgData = new ImageData(new Uint8ClampedArray(data), w, h);
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL(
    format === "png" ? "image/png" : "image/jpeg",
    quality
  );
}
