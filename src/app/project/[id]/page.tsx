"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Download, Copy, Check, ArrowLeft, Sparkles, Layers, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getGlobalData } from "@/lib/store";

export default function ProjectPage() {
  const [activeTab, setActiveTab] = useState<"design" | "analysis">("design");
  const [copied, setCopied] = useState(false);

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [extractedDesign, setExtractedDesign] = useState<string | null>(null);
  const [analysisOverlay, setAnalysisOverlay] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    // Read immediately
    const data = getGlobalData();
    setUploadedImage(data.uploadedImage);
    setExtractedDesign(data.extractedDesign);
    setAnalysisOverlay(data.analysisOverlay);
    setFileName(data.uploadedFileName);

    // Retry after a short delay in case of timing issues
    if (!data.uploadedImage) {
      const t = setTimeout(() => {
        const retry = getGlobalData();
        setUploadedImage(retry.uploadedImage);
        setExtractedDesign(retry.extractedDesign);
        setAnalysisOverlay(retry.analysisOverlay);
        setFileName(retry.uploadedFileName);
      }, 200);
      return () => clearTimeout(t);
    }
  }, []);

  const handleCopy = () => {
    if (!extractedDesign) return;
    const a = document.createElement("a");
    a.href = extractedDesign;
    navigator.clipboard.writeText("Image copied as data URL");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format: "png" | "jpg") => {
    if (!extractedDesign) return;
    const baseName = fileName?.replace(/\.[^/.]+$/, "") || "extracted-design";

    if (format === "png") {
      const a = document.createElement("a");
      a.href = extractedDesign;
      a.download = `${baseName}.png`;
      a.click();
    } else {
      // Convert PNG to JPG
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/jpeg", 0.95);
        a.download = `${baseName}.jpg`;
        a.click();
      };
      img.src = extractedDesign;
    }
  };

  if (!uploadedImage || !extractedDesign) {
    return (
      <div className="min-h-screen pt-20 pb-12 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No design to display. Upload a mockup first.</p>
          <Button onClick={() => (window.location.href = "/")}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => (window.location.href = "/")} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">Extracted Design</h1>
              <p className="text-sm text-muted-foreground">{fileName}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleDownload("png")}>
                <Download className="w-4 h-4 mr-1.5" />
                PNG
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDownload("jpg")}>
                <Download className="w-4 h-4 mr-1.5" />
                JPG
              </Button>
              <Button size="sm" className="bg-gradient-to-r from-primary to-accent text-white" onClick={() => handleDownload("png")}>
                <Download className="w-4 h-4 mr-1.5" />
                Download Full
              </Button>
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab("design")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "design" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground border border-transparent"}`}
            >
              <Layers className="w-4 h-4" />
              Flat Design
            </button>
            <button
              onClick={() => setActiveTab("analysis")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "analysis" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground border border-transparent"}`}
            >
              <Eye className="w-4 h-4" />
              Analysis View
            </button>
          </div>

          {activeTab === "design" ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Card className="glass border-border/30 overflow-hidden">
                  <div className="relative bg-zinc-900 p-6">
                    {/* Checkerboard transparency background */}
                    <div
                      className="absolute inset-0 opacity-10"
                      style={{
                        backgroundImage: "repeating-conic-gradient(#666 0% 25%, transparent 0% 50%)",
                        backgroundSize: "20px 20px",
                      }}
                    />
                    <img
                      src={extractedDesign}
                      alt="Extracted design"
                      className="relative w-full h-auto rounded-lg shadow-2xl"
                      style={{ maxHeight: "500px", objectFit: "contain" }}
                    />
                  </div>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="glass border-border/30 p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> AI Extraction
                  </h3>
                  <Badge variant="outline" className="text-success border-success/30 bg-success/5">
                    Complete
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    Design detected, perspective flattened, edges cleaned, colors enhanced
                  </p>
                </Card>

                <Card className="glass border-border/30 p-5">
                  <h3 className="font-semibold mb-3">Output Details</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Format</span>
                      <span>PNG (Transparent)</span>
                    </div>
                    <Separator className="bg-border/30" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Original</span>
                      <span className="truncate max-w-[140px]">{fileName}</span>
                    </div>
                    <Separator className="bg-border/30" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type</span>
                      <span>Flat Artwork</span>
                    </div>
                    <Separator className="bg-border/30" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size</span>
                      <span>{(new Blob([extractedDesign]).size / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                </Card>

                <Card className="glass border-border/30 p-5">
                  <h3 className="font-semibold mb-3">Download Options</h3>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start" size="sm" onClick={() => handleDownload("png")}>
                      <Download className="w-4 h-4 mr-2" /> PNG (Transparent BG)
                    </Button>
                    <Button variant="outline" className="w-full justify-start" size="sm" onClick={() => handleDownload("jpg")}>
                      <Download className="w-4 h-4 mr-2" /> JPG (White BG)
                    </Button>
                  </div>
                </Card>

                <Button variant="outline" className="w-full" onClick={() => (window.location.href = "/")}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Extract Another
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="glass border-border/30 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/30">
                  <span className="text-sm font-medium">Original Mockup</span>
                </div>
                <div className="bg-zinc-900 p-4">
                  <img
                    src={uploadedImage}
                    alt="Original mockup"
                    className="w-full h-auto rounded-lg"
                    style={{ maxHeight: "400px", objectFit: "contain" }}
                  />
                </div>
              </Card>

              <Card className="glass border-border/30 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/30">
                  <span className="text-sm font-medium">AI Analysis</span>
                </div>
                <div className="bg-zinc-900 p-4">
                  {analysisOverlay ? (
                    <img
                      src={analysisOverlay}
                      alt="AI analysis overlay"
                      className="w-full h-auto rounded-lg"
                      style={{ maxHeight: "400px", objectFit: "contain" }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      No analysis available
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
