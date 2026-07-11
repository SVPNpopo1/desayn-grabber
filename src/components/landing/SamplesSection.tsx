"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";

const samples = [
  { name: "Sublimation T-Shirt", type: "Garment Mockup" },
  { name: "All-Over Print Hoodie", type: "Apparel Photo" },
  { name: "Jersey Front Design", type: "Sportswear Shot" },
];

function ComparisonSlider({ name, type }: { name: string; type: string }) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card/30 overflow-hidden">
      <div
        ref={containerRef}
        className="relative aspect-video cursor-col-resize select-none"
        onMouseMove={(e) => handleMove(e.clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      >
        {/* Mockup photo (left) */}
        <div className="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center">
          <div className="text-center">
            <div className="w-32 h-32 mx-auto rounded-xl bg-muted/50 border border-border/30 flex items-center justify-center mb-3">
              <svg className="w-16 h-16 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                <path d="M20.38 3.46L16 2 12 3.46 8 2 3.62 3.46a2 2 0 0 0-1.34 1.89v12.3a2 2 0 0 0 2.66 1.89L8 18l4-1.46L16 18l4.38 1.46a2 2 0 0 0 2.66-1.89V5.35a2 2 0 0 0-1.34-1.89z" />
                <line x1="12" y1="2" x2="12" y2="16.54" />
              </svg>
            </div>
            <span className="text-xs text-muted-foreground">Mockup Photo</span>
          </div>
        </div>

        {/* Extracted design (right) */}
        <div className="absolute inset-0 bg-gradient-to-br from-success/10 to-accent/5 flex items-center justify-center">
          <div className="text-center">
            <div className="w-32 h-32 mx-auto rounded-xl bg-success/5 border border-success/20 flex items-center justify-center mb-3">
              <svg className="w-16 h-16 text-success/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
            <span className="text-xs text-muted-foreground">Extracted Design</span>
          </div>
        </div>

        {/* Clipped overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-success/10 to-accent/5 flex items-center justify-center"
          style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
        >
          <div className="text-center">
            <div className="w-32 h-32 mx-auto rounded-xl bg-success/5 border border-success/20 flex items-center justify-center mb-3">
              <svg className="w-16 h-16 text-success/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
            <span className="text-xs text-muted-foreground">Extracted Design</span>
          </div>
        </div>

        {/* Slider line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
          style={{ left: `${sliderPos}%` }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
            <GripVertical className="w-4 h-4 text-gray-800" />
          </div>
        </div>
      </div>
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">{name}</h4>
          <p className="text-xs text-muted-foreground">{type}</p>
        </div>
        <span className="text-xs text-success font-medium px-2 py-1 rounded-full bg-success/10">Auto-Extracted</span>
      </div>
    </div>
  );
}

export function SamplesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="samples" className="py-24 sm:py-32 bg-muted/20" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Sample <span className="bg-gradient-to-r from-primary-light to-accent bg-clip-text text-transparent">Extractions</span>
          </h2>
          <p className="text-lg text-muted-foreground">Slide to compare the original mockup photo vs. the extracted flat design.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {samples.map((sample, i) => (
            <motion.div
              key={sample.name}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.1 }}
            >
              <ComparisonSlider name={sample.name} type={sample.type} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
