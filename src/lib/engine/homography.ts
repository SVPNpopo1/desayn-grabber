import type { Point, Quad } from "./types";

export function computeHomography(src: Quad, dst: Quad): number[] {
  // Compute 3x3 homography matrix H such that dst = H * src
  // Solves 8-equation system using Gauss elimination

  const sx = [src.topLeft.x, src.topRight.x, src.bottomRight.x, src.bottomLeft.x];
  const sy = [src.topLeft.y, src.topRight.y, src.bottomRight.y, src.bottomLeft.y];
  const dx = [dst.topLeft.x, dst.topRight.x, dst.bottomRight.x, dst.bottomLeft.x];
  const dy = [dst.topLeft.y, dst.topRight.y, dst.bottomRight.y, dst.bottomLeft.y];

  // Build 8x9 matrix
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    A.push([dx[i], dy[i], 1, 0, 0, 0, -sx[i] * dx[i], -sy[i] * dx[i], -dx[i]]);
    A.push([0, 0, 0, dx[i], dy[i], 1, -sx[i] * dy[i], -sy[i] * dy[i], -dy[i]]);
  }

  // Gauss elimination
  const n = 8;
  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > maxVal) {
        maxVal = Math.abs(A[row][col]);
        maxRow = row;
      }
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];

    const pivot = A[col][col];
    if (Math.abs(pivot) < 1e-10) continue;

    for (let j = col; j < 9; j++) A[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      for (let j = col; j < 9; j++) {
        A[row][j] -= factor * A[col][j];
      }
    }
  }

  // Extract H (normalize so H[8] = 1)
  const h = [0, 0, 0, 0, 0, 0, 0, 0, 1];
  for (let i = 0; i < 8; i++) {
    h[i] = A[i][8];
  }

  return h;
}

export function inverseHomography(h: number[]): number[] {
  // Compute inverse of 3x3 homography using cofactor expansion
  const [
    a, b, c,
    d, e, f,
    g, i2, j,
  ] = h;

  const det =
    a * (e * j - f * i2) -
    b * (d * j - f * g) +
    c * (d * i2 - e * g);

  if (Math.abs(det) < 1e-10) return h; // Singular, return as-is

  const invDet = 1 / det;

  return [
    (e * j - f * i2) * invDet,
    (c * i2 - b * j) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * j) * invDet,
    (a * j - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * i2 - e * g) * invDet,
    (b * g - a * i2) * invDet,
    (a * e - b * d) * invDet,
  ];
}

export function warpPerspective(
  srcData: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  srcQuad: Quad,
  outW: number,
  outH: number
): ImageData {
  const dstQuad: Quad = {
    topLeft: { x: 0, y: 0 },
    topRight: { x: outW, y: 0 },
    bottomRight: { x: outW, y: outH },
    bottomLeft: { x: 0, y: outH },
  };

  const h = computeHomography(dstQuad, srcQuad); // forward: dst->src
  const out = new ImageData(outW, outH);

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const denom = h[6] * ox + h[7] * oy + h[8];
      if (Math.abs(denom) < 1e-10) continue;

      const srcX = (h[0] * ox + h[1] * oy + h[2]) / denom;
      const srcY = (h[3] * ox + h[4] * oy + h[5]) / denom;

      if (srcX < 0 || srcX >= srcW - 1 || srcY < 0 || srcY >= srcH - 1) continue;

      // Bilinear interpolation
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const dx = srcX - x0;
      const dy = srcY - y0;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;

      const oi = (oy * outW + ox) * 4;
      for (let c = 0; c < 4; c++) {
        out.data[oi + c] = Math.round(
          (1 - dx) * (1 - dy) * srcData[i00 + c] +
          dx * (1 - dy) * srcData[i10 + c] +
          (1 - dx) * dy * srcData[i01 + c] +
          dx * dy * srcData[i11 + c]
        );
      }
    }
  }

  return out;
}
