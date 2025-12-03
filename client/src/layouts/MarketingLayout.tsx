import { Navbar } from "@/components/marketing/Navbar";
import { Footer } from "@/components/marketing/Footer";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";

interface MarketingLayoutProps {
  children: React.ReactNode;
}

const pageVariants = {
  initial: {
    opacity: 0,
  },
  enter: {
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export function MarketingLayout({ children }: MarketingLayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <AnimatePresence mode="wait">
        <motion.main 
          key={location}
          className="flex-1"
          initial="initial"
          animate="enter"
          exit="exit"
          variants={pageVariants}
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  );
}
