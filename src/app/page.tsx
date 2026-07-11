import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { RasterVsVectorSection } from "@/components/landing/RasterVsVectorSection";
import { SamplesSection } from "@/components/landing/SamplesSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { Footer } from "@/components/shared/Footer";

export default function Home() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <SamplesSection />
      <RasterVsVectorSection />
      <FAQSection />
      <Footer />
    </>
  );
}
