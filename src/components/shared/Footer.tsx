"use client";

import Link from "next/link";
import { Logo } from "@/components/shared/Logo";

const footerLinks = {
  Product: [
    { label: "Features", href: "/#how-it-works" },
    { label: "Samples", href: "/#samples" },
    { label: "FAQ", href: "/#faq" },
    { label: "API", href: "#" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Contact", href: "#" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
    { label: "Cookie Policy", href: "#" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-card/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-12 sm:py-16">
          <div className="col-span-2 md:col-span-1">
            <Logo className="mb-4" />
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              AI-powered vector tracing for sublimation. Convert any raster image into ultra-clean, scalable SVGs.
            </p>
          </div>
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold mb-4">{category}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} DESAYN. All rights reserved.</p>
          <p className="text-xs text-muted-foreground">Built with <span className="text-primary">AI</span> for sublimation artists.</p>
        </div>
      </div>
    </footer>
  );
}
