export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageBuffer {
  data: Float32Array;
  width: number;
  height: number;
  channels: number;
}

export interface PipelineOptions {
  maxColors?: number;
  edgeStrength?: number;
  wrinkleRemoval?: number;
  perspectiveCorrection?: boolean;
  backgroundRemoval?: boolean;
  colorCorrection?: boolean;
  denoise?: boolean;
  outputFormat?: "png" | "jpeg";
  outputQuality?: number;
  outputWidth?: number;
  outputHeight?: number;
}

export interface PipelineResult {
  success: boolean;
  error?: string;
  outputImage?: string;
  outputMask?: string;
  steps: PipelineStep[];
  processingTime: number;
  dimensions?: {
    input: { w: number; h: number };
    output: { w: number; h: number };
  };
  cropRegion?: { x: number; y: number; w: number; h: number };
  maskData?: Uint8Array;
}

export interface PipelineStep {
  name: string;
  duration: number;
  inputDimensions?: { w: number; h: number };
  details?: string;
}
