import { Link } from "wouter";
import { motion } from "framer-motion";

const footerLinks = {
  product: [
    { label: "Features", path: "/features" },
    { label: "Pricing", path: "/pricing" },
    { label: "Resources", path: "/resources" },
  ],
  company: [
    { label: "About", path: "/company/about" },
    { label: "Security", path: "/company/security" },
    { label: "Contact", path: "/company/contact" },
  ],
  legal: [
    { label: "Terms of Service", path: "#terms" },
    { label: "Privacy Policy", path: "#privacy" },
  ],
};

export function Footer() {
  return (
    <motion.footer 
      className="border-t border-border/40 bg-background"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
          <div className="col-span-2 md:col-span-1">
            <img 
              src="/logo.png" 
              alt="BlackTop Systems" 
              className="h-6 object-contain mb-4 opacity-80" 
            />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Financial clarity for founders who move fast.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-4">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.path}>
                  <Link href={link.path}>
                    <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                      {link.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.path}>
                  <Link href={link.path}>
                    <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                      {link.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-4">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.path}>
                  <a 
                    href={link.path} 
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-border/40 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} BlackTop Systems. All rights reserved.
          </p>
        </div>
      </div>
    </motion.footer>
  );
}
