import { MotionConfig } from "framer-motion";
import Nav from "./components/Nav";
import Hero from "./sections/Hero";
import Providers from "./sections/Providers";
import Features from "./sections/Features";
import Stealth from "./sections/Stealth";
import UseCases from "./sections/UseCases";
import Story from "./sections/Story";
import HowItWorks from "./sections/HowItWorks";
import Gallery from "./sections/Gallery";
import Privacy from "./sections/Privacy";
import Faq from "./sections/Faq";
import FinalCta from "./sections/FinalCta";
import Footer from "./sections/Footer";

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <a className="skip-link" href="#top">
        Skip to content
      </a>
      <Nav />
      <main>
        <Hero />
        <Providers />
        <Features />
        <Stealth />
        <UseCases />
        <Story />
        <HowItWorks />
        <Gallery />
        <Privacy />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </MotionConfig>
  );
}
