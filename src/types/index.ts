export interface Project {
  id: string;
  originalUrl: string;
  originalName: string;
  svgUrl?: string;
  thumbnail?: string;
  status: "processing" | "completed" | "failed";
  enhanceAI: boolean;
  createdAt: string;
  userId?: string;
}

export interface VectorizeOptions {
  enhanceAI: boolean;
  colorPrecision: number;
  filterSpeckles: boolean;
  cornerThreshold: number;
}

export interface FAQItem {
  question: string;
  answer: string;
}
