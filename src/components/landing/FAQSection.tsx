"use client";

import { motion, useInView, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  { question: "What is DESAYN?", answer: "DESAYN is an AI-powered design extraction tool. Upload a photo of a garment, mockup, or sublimation print, and our AI engine detects the design, flattens perspective, reconstructs hidden areas, and outputs a clean flat artwork ready for editing or printing." },
  { question: "What image formats are supported?", answer: "We support PNG, JPG, and JPEG input. Output is delivered as PNG (transparent background) or JPG (white background). For best results, use well-lit photos where the design is clearly visible." },
  { question: "What accuracy can I expect?", answer: "Accuracy ranges from 80-95% depending on image quality, resolution, and how much of the design is visible. Clean, well-lit mockups with minimal wrinkles produce the best results." },
  { question: "What does 'AI Enhance' do?", answer: "AI Enhance applies auto color correction, contrast boosting, and edge cleaning to the extracted design. It improves the output quality for print-ready results." },
  { question: "Can I use the output for commercial printing?", answer: "Yes! The extracted artwork is production-ready and suitable for sublimation printing, screen printing, DTG, embroidery, vinyl cutting, and other commercial applications." },
  { question: "How does the extraction work?", answer: "Our AI engine analyzes the uploaded photo to detect design boundaries using color analysis. It then applies perspective warping to flatten the design from the garment surface, enhances colors, cleans edges, and outputs a clean rectangular artwork." },
];

function FAQItem({ question, answer, isOpen, onToggle }: { question: string; answer: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border/50 last:border-0">
      <button onClick={onToggle} className="flex items-center justify-between w-full py-5 text-left">
        <span className="text-base font-medium pr-4">{question}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <p className="pb-5 text-sm text-muted-foreground leading-relaxed">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24 sm:py-32" ref={ref}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Frequently Asked Questions
          </h2>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.2 }} className="rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm p-6 sm:p-8">
          {faqs.map((faq, i) => (
            <FAQItem key={i} question={faq.question} answer={faq.answer} isOpen={openIndex === i} onToggle={() => setOpenIndex(openIndex === i ? null : i)} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
