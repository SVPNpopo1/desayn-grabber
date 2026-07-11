"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Upload, ScanLine, Download } from "lucide-react";

const steps = [
  {
    step: "01",
    icon: Upload,
    title: "Upload your mockup photo",
    description: "Shirt mockup, sublimation photo, or any garment image.",
  },
  {
    step: "02",
    icon: ScanLine,
    title: "AI detects & reconstructs",
    description: "Analyzes visible design, flattens perspective, fills hidden areas.",
  },
  {
    step: "03",
    icon: Download,
    title: "Download flat artwork",
    description: "Clean, print-ready rectangular design for sublimation.",
  },
];

export function HowItWorksSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="how-it-works" className="py-24 sm:py-32" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent/20 bg-accent/5 text-accent text-sm mb-6">
            How to Use DESAYN
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Extract designs in <span className="bg-gradient-to-r from-accent to-primary-light bg-clip-text text-transparent">seconds</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Our AI engine detects, flattens, and reconstructs designs from any mockup or garment photo.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-1/2 left-[16%] right-[16%] h-px bg-gradient-to-r from-primary/50 via-accent/50 to-primary-light/50" />
          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative text-center"
            >
              <div className="relative inline-flex mb-6">
                <div className="bg-primary/10 p-6 rounded-2xl border border-border/30">
                  <step.icon className="w-8 h-8 text-primary" />
                </div>
                <span className="absolute -top-2 -right-2 text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border/50">
                  {step.step}
                </span>
              </div>
              <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
