"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/Logo";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="absolute inset-0 backdrop-blur-xl bg-background/80 border-b border-border/50" />
      <nav className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Logo />
        <div className="hidden md:flex items-center gap-8">
          <Link href="/#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it Works</Link>
          <Link href="/#samples" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Samples</Link>
          <Link href="/#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</Link>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Link href="/auth/login">
            <Button variant="ghost" size="sm">Log In</Button>
          </Link>
          <Link href="/auth/register">
            <Button size="sm" className="bg-gradient-to-r from-primary to-accent hover:from-primary-light hover:to-accent-light text-white shadow-lg shadow-primary/25">
              <Sparkles className="w-4 h-4 mr-1.5" />
              New Project
            </Button>
          </Link>
        </div>
        <button className="md:hidden p-2 text-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      {mobileOpen && (
        <div className="relative md:hidden border-b border-border bg-background/95 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-3">
            <Link href="/#how-it-works" className="block py-2 text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>How it Works</Link>
            <Link href="/#samples" className="block py-2 text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>Samples</Link>
            <Link href="/#faq" className="block py-2 text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>FAQ</Link>
            <div className="pt-3 border-t border-border flex flex-col gap-2">
              <Link href="/auth/login" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full">Log In</Button>
              </Link>
              <Link href="/auth/register" onClick={() => setMobileOpen(false)}>
                <Button className="w-full bg-gradient-to-r from-primary to-accent text-white">
                  <Sparkles className="w-4 h-4 mr-1.5" /> New Project
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
