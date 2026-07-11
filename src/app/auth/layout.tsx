import { Logo } from "@/components/shared/Logo";
import { AuroraBackground } from "@/components/shared/AuroraBackground";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-20">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
