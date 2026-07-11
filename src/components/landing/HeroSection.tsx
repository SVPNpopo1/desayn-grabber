"use client";

import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, Sparkles, ArrowRight, FileImage, Layers, ScanLine, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useAppStore, setGlobalData, getGlobalData } from "@/lib/store";
import { extractDesign, generateAnalysisOverlay } from "@/lib/extractor";

export function HeroSection() {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [progress, setProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const enhanceAI = useAppStore((s) => s.enhanceAI);
  const setEnhanceAI = useAppStore((s) => s.setEnhanceAI);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleExtract = async () => {
    if (!preview) return;
    setProgress("Analyzing design...");
    try {
      await new Promise((r) => setTimeout(r, 300));

      setProgress("Detecting patterns...");
      const { overlayDataUrl } = await generateAnalysisOverlay(preview, { margin: 5 });
      await new Promise((r) => setTimeout(r, 400));

      setProgress("Extracting artwork...");
      const extracted = await extractDesign(preview, {
        margin: 5,
        enhance: enhanceAI,
        outputWidth: 800,
      });
      await new Promise((r) => setTimeout(r, 200));

      setProgress("Reconstructing...");
      setGlobalData({
        uploadedImage: preview,
        uploadedFileName: fileName,
        extractedDesign: extracted,
        analysisOverlay: overlayDataUrl,
      });

      router.push("/project/result");
    } catch (err) {
      console.error("Extraction failed:", err);
      setProgress("Failed - try a different image");
    } finally {
      setProgress("");
    }
  };

  return (
    <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-sm mb-8"
          >
            <ScanLine className="w-4 h-4" />
            AI Design Extraction Engine
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
          >
            Extract flat artwork from{" "}
            <span className="bg-gradient-to-r from-primary-light via-accent to-primary-light bg-clip-text text-transparent animate-gradient">
              any mockup photo
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 text-balance"
          >
            Upload a sublimation mockup or garment image. AI analyzes the visible design, reconstructs hidden areas, and generates a clean flat artwork for printing.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 p-8 sm:p-12 ${
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.02]"
                  : preview
                  ? "border-primary/30 bg-card/30"
                  : "border-border hover:border-primary/30 hover:bg-card/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />

              {preview ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <img src={preview} alt="Preview" className="max-h-48 rounded-lg shadow-lg" />
                    <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/50 to-transparent" />
                  </div>
                  <p className="text-sm text-muted-foreground">{fileName}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 rounded-2xl bg-primary/10">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-medium">Upload Mockup Photo</p>
                    <p className="text-sm text-muted-foreground mt-1">or drop a garment image</p>
                  </div>
                  <p className="text-xs text-muted-foreground/60">Shirt mockups, sublimation photos, garment shots</p>
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex items-center justify-center gap-6 mt-6 mb-8"
          >
            <div className="flex items-center gap-3">
              <Switch
                id="enhance"
                checked={enhanceAI}
                onCheckedChange={setEnhanceAI}
              />
              <Label htmlFor="enhance" className="text-sm cursor-pointer">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  AI enhance output
                </span>
                <span className="text-xs text-muted-foreground">(Color correction + contrast)</span>
              </Label>
            </div>
          </motion.div>

          {preview && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <Button
                onClick={handleExtract}
                size="lg"
                disabled={!!progress}
                className="bg-gradient-to-r from-primary to-accent hover:from-primary-light hover:to-accent-light text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 px-8"
              >
                {progress ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {progress}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Extract Design
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </motion.div>
          )}

          {!preview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex flex-wrap justify-center gap-3 mt-4"
            >
              {[
                { icon: FileImage, label: "New Project" },
                { icon: Layers, label: "Batch Process" },
              ].map((action) => (
                <button
                  key={action.label}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-4 py-2 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
                >
                  <action.icon className="w-4 h-4" />
                  {action.label}
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
