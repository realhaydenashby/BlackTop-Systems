import { Link } from "wouter";
import logoUrl from "@assets/generated_images/minimalist_blacktop_systems_logo.png";

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 p-1.5 ring-1 ring-primary/20">
                <img 
                  src={logoUrl} 
                  alt="BlackTop Systems" 
                  className="w-full h-full object-contain" 
                />
              </div>
              <span className="font-bold">BlackTop Systems</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Financial Clarity. Instantly.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/features">
                  <span className="hover:text-primary transition-colors cursor-pointer">Features</span>
                </Link>
              </li>
              <li>
                <Link href="/pricing">
                  <span className="hover:text-primary transition-colors cursor-pointer">Pricing</span>
                </Link>
              </li>
              <li>
                <Link href="/resources">
                  <span className="hover:text-primary transition-colors cursor-pointer">Resources</span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/company/about">
                  <span className="hover:text-primary transition-colors cursor-pointer">About</span>
                </Link>
              </li>
              <li>
                <Link href="/company/security">
                  <span className="hover:text-primary transition-colors cursor-pointer">Security & Privacy</span>
                </Link>
              </li>
              <li>
                <Link href="/company/contact">
                  <span className="hover:text-primary transition-colors cursor-pointer">Contact</span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} BlackTop Systems. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
