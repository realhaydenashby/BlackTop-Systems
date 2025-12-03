import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { motion } from "framer-motion";

export function Navbar() {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    { path: "/features", label: "Product" },
    { path: "/pricing", label: "Pricing" },
    { path: "/resources", label: "Resources" },
  ];

  return (
    <motion.nav 
      className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between w-full px-6 h-16">
        <Link href="/">
          <motion.div 
            className="flex items-center gap-2 cursor-pointer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <img 
              src="/logo.png" 
              alt="BlackTop Systems" 
              className="h-6 object-contain" 
            />
          </motion.div>
        </Link>

        <div className="flex items-center gap-8">
          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <motion.span
                  className={`text-sm font-medium transition-colors cursor-pointer relative ${
                    isActive(item.path) ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  whileHover={{ y: -1 }}
                  transition={{ duration: 0.2 }}
                >
                  {item.label}
                  {isActive(item.path) && (
                    <motion.div 
                      className="absolute -bottom-1 left-0 right-0 h-px bg-foreground"
                      layoutId="navbar-indicator"
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                </motion.span>
              </Link>
            ))}

            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger 
                    className={`text-sm font-medium bg-transparent hover:bg-transparent ${
                      isActive("/company") ? "text-foreground" : "text-muted-foreground"
                    }`}
                    data-testid="nav-company"
                  >
                    Company
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <motion.ul 
                      className="grid w-52 gap-1 p-2"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {[
                        { path: "/company/about", label: "About", desc: "Our mission and story" },
                        { path: "/company/security", label: "Security", desc: "How we protect your data" },
                        { path: "/company/contact", label: "Contact", desc: "Get in touch" },
                      ].map((item) => (
                        <li key={item.path}>
                          <Link href={item.path}>
                            <div
                              className="block select-none rounded-lg p-3 leading-none no-underline outline-none transition-colors hover:bg-muted cursor-pointer"
                              data-testid={`nav-${item.label.toLowerCase()}`}
                            >
                              <div className="text-sm font-medium">{item.label}</div>
                              <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </motion.ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          <Button asChild size="sm" className="h-9 px-4" data-testid="button-login">
            <a href="/api/login">Log In</a>
          </Button>
        </div>
      </div>
    </motion.nav>
  );
}
