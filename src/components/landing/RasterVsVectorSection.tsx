"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Scan, Palette, Maximize } from "lucide-react";

const features = [
  {
    icon: Scan,
    title: "Smart Design Detection",
    description: "AI analyzes the image to find the design boundaries, automatically separating artwork from the garment background.",
  },
  {
    icon: Palette,
    title: "Perspective Flattening",
    description: "Detects folds, wrinkles, and perspective distortion. Warps the design back to a clean flat rectangular shape.",
  },
  {
    icon: Maximize,
    title: "Color Enhancement",
    description: "Auto-corrects lighting, boosts saturation, and cleans edges for a print-ready output.",
  },
];

export function RasterVsVectorSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-24 sm:py-32" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Powered by AI
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From mockup photo to flat artwork in seconds. No Photoshop skills needed.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 * i }}
              className="p-8 rounded-2xl border border-border/50 bg-card/30 text-center"
            >
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <f.icon className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
