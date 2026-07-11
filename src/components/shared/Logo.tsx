"use client";

import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className, size = "md" }: LogoProps) {
  const sizes = { sm: "text-lg", md: "text-xl", lg: "text-2xl" };
  return (
    <div className={cn("flex items-center gap-2.5 font-bold", sizes[size], className)}>
      <div className="relative flex items-center justify-center w-9 h-9">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary to-accent blur-sm opacity-50" />
        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </div>
      </div>
      <span className="bg-gradient-to-r from-primary-light to-accent bg-clip-text text-transparent">
        DESAYN
      </span>
    </div>
  );
}
