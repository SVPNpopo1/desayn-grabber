"use client";

import { create } from "zustand";

interface StoredData {
  uploadedImage: string | null;
  uploadedFileName: string | null;
  extractedDesign: string | null;
  analysisOverlay: string | null;
}

const KEY = "desayn_data";
const EMPTY: StoredData = { uploadedImage: null, uploadedFileName: null, extractedDesign: null, analysisOverlay: null };

export function getGlobalData(): StoredData {
  if (typeof window === "undefined") return EMPTY;
  try {
    // Try combined key first
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);

    // Try split keys (large data fallback)
    const img = sessionStorage.getItem(KEY + "_img");
    const svg = sessionStorage.getItem(KEY + "_svg");
    const meta = sessionStorage.getItem(KEY + "_meta");
    if (img || svg || meta) {
      const m = meta ? JSON.parse(meta) : {};
      return {
        uploadedImage: img || null,
        uploadedFileName: m.uploadedFileName ?? null,
        extractedDesign: svg || null,
        analysisOverlay: m.analysisOverlay ?? null,
      };
    }
  } catch (e) {
    console.error("getGlobalData failed:", e);
  }
  return EMPTY;
}

export function setGlobalData(data: Partial<StoredData>) {
  if (typeof window === "undefined") return;
  const prev = getGlobalData();
  const merged = { ...prev, ...data };

  // Try storing as one blob
  try {
    const json = JSON.stringify(merged);
    sessionStorage.setItem(KEY, json);
    // Clean up split keys if they existed
    sessionStorage.removeItem(KEY + "_img");
    sessionStorage.removeItem(KEY + "_svg");
    sessionStorage.removeItem(KEY + "_meta");
    sessionStorage.removeItem(KEY + "_split");
    return;
  } catch {
    // Quota exceeded — try split storage
  }

  // Fallback: store each key separately
  try {
    if (merged.uploadedImage) sessionStorage.setItem(KEY + "_img", merged.uploadedImage);
    if (merged.extractedDesign) sessionStorage.setItem(KEY + "_svg", merged.extractedDesign);
    sessionStorage.setItem(KEY + "_meta", JSON.stringify({
      uploadedFileName: merged.uploadedFileName,
      analysisOverlay: merged.analysisOverlay,
    }));
    sessionStorage.setItem(KEY + "_split", "1");
    // Remove combined key
    sessionStorage.removeItem(KEY);
  } catch (e) {
    console.error("Cannot store data at all:", e);
  }
}

interface AppState {
  enhanceAI: boolean;
  user: { name: string; email: string } | null;
  setEnhanceAI: (enhance: boolean) => void;
  setUser: (user: { name: string; email: string } | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  enhanceAI: true,
  user: null,
  setEnhanceAI: (enhanceAI) => set({ enhanceAI }),
  setUser: (user) => set({ user }),
}));
