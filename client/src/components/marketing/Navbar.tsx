import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { ChevronDown } from "lucide-react";
import logoUrl from "@assets/generated_images/minimalist_blacktop_systems_logo.png";

export function Navbar() {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 hover-elevate rounded-lg px-2 py-1 -ml-2">
          <div className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 p-1.5 ring-1 ring-primary/20">
            <img 
              src={logoUrl} 
              alt="BlackTop Systems" 
              className="w-full h-full object-contain" 
            />
          </div>
          <span className="font-bold text-lg">BlackTop Systems</span>
        </Link>

        <div className="flex items-center gap-6">
          <Link href="/features">
            <span
              className={`text-sm font-medium transition-colors hover:text-primary cursor-pointer ${
                isActive("/features") ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid="nav-features"
            >
              Product
            </span>
          </Link>

          <Link href="/pricing">
            <span
              className={`text-sm font-medium transition-colors hover:text-primary cursor-pointer ${
                isActive("/pricing") ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid="nav-pricing"
            >
              Pricing
            </span>
          </Link>

          <Link href="/resources">
            <span
              className={`text-sm font-medium transition-colors hover:text-primary cursor-pointer ${
                isActive("/resources") ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid="nav-resources"
            >
              Resources
            </span>
          </Link>

          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger 
                  className={`text-sm font-medium ${
                    isActive("/company") ? "text-primary" : "text-muted-foreground"
                  }`}
                  data-testid="nav-company"
                >
                  Company
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-48 gap-1 p-2">
                    <li>
                      <Link href="/company/about">
                        <div
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                          data-testid="nav-company-about"
                        >
                          <div className="text-sm font-medium leading-none">About</div>
                          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                            Our mission and story
                          </p>
                        </div>
                      </Link>
                    </li>
                    <li>
                      <Link href="/company/security">
                        <div
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                          data-testid="nav-company-security"
                        >
                          <div className="text-sm font-medium leading-none">Security & Privacy</div>
                          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                            How we protect your data
                          </p>
                        </div>
                      </Link>
                    </li>
                    <li>
                      <Link href="/company/contact">
                        <div
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                          data-testid="nav-company-contact"
                        >
                          <div className="text-sm font-medium leading-none">Contact</div>
                          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground mt-1">
                            Get in touch with us
                          </p>
                        </div>
                      </Link>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <Button asChild data-testid="button-login">
            <a href="/api/login">Log In</a>
          </Button>
        </div>
      </div>
    </nav>
  );
}
