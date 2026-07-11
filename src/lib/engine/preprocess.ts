import type { ImageBuffer } from "./types";

export function imageDataToBuffer(imageData: ImageData): ImageBuffer {
  const { width, height, data } = imageData;
  const buf = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    buf[i * 3] = data[i * 4];
    buf[i * 3 + 1] = data[i * 4 + 1];
    buf[i * 3 + 2] = data[i * 4 + 2];
  }
  return { data: buf, width, height, channels: 3 };
}

export function bufferToGrayscale(buf: ImageBuffer): Float32Array {
  const gray = new Float32Array(buf.width * buf.height);
  for (let i = 0; i < buf.width * buf.height; i++) {
    gray[i] = 0.299 * buf.data[i * 3] + 0.587 * buf.data[i * 3 + 1] + 0.114 * buf.data[i * 3 + 2];
  }
  return gray;
}

export function gaussianBlur(
  data: Float32Array,
  w: number,
  h: number,
  radius: number
): Float32Array {
  if (radius <= 0) return new Float32Array(data);

  const kernel: number[] = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * radius * radius));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const temp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(Math.max(x + k, 0), w - 1);
        val += data[y * w + sx] * kernel[k + radius];
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

export function rgbToLab(buf: ImageBuffer): ImageBuffer {
  const out = new Float32Array(buf.width * buf.height * 3);
  const n = buf.width * buf.height;

  for (let i = 0; i < n; i++) {
    let r = buf.data[i * 3] / 255;
    let g = buf.data[i * 3 + 1] / 255;
    let b = buf.data[i * 3 + 2] / 255;

    // Linearize sRGB
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    // sRGB to XYZ
    const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
    const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
    const z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;

    // XYZ to LAB (D65 white point)
    const xn = 0.95047, yn = 1.0, zn = 1.08883;
    const fx = labF(x / xn);
    const fy = labF(y / yn);
    const fz = labF(z / zn);

    out[i * 3] = 116 * fy - 16;         // L
    out[i * 3 + 1] = 500 * (fx - fy);   // a
    out[i * 3 + 2] = 200 * (fy - fz);   // b
  }

  return { data: out, width: buf.width, height: buf.height, channels: 3 };
}

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta * delta * delta
    ? Math.cbrt(t)
    : t / (3 * delta * delta) + 4 / 29;
}

export function computeGradients(
  gray: Float32Array,
  w: number,
  h: number
): { magnitude: Float32Array; direction: Float32Array } {
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

  return { magnitude: mag, direction: dir };
}

export function toImageData(buf: ImageBuffer): ImageData {
  const d = new ImageData(buf.width, buf.height);
  for (let i = 0; i < buf.width * buf.height; i++) {
    d.data[i * 4] = Math.max(0, Math.min(255, buf.data[i * 3]));
    d.data[i * 4 + 1] = Math.max(0, Math.min(255, buf.data[i * 3 + 1]));
    d.data[i * 4 + 2] = Math.max(0, Math.min(255, buf.data[i * 3 + 2]));
    d.data[i * 4 + 3] = 255;
  }
  return d;
}

export function grayscaleToImageData(gray: Float32Array, w: number, h: number): ImageData {
  const d = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, gray[i]));
    d.data[i * 4] = v;
    d.data[i * 4 + 1] = v;
    d.data[i * 4 + 2] = v;
    d.data[i * 4 + 3] = 255;
  }
  return d;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
