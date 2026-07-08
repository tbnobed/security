import { useState } from "react";
import { Link, useLocation } from "wouter";
import { CalendarClock, Users, ClipboardList, LogOut, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";

interface ClientLayoutProps {
  children: React.ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user: me, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSignOut = async () => {
    await logout();
    setLocation("/sign-in");
  };

  const navItems = [
    { href: "/portal", label: "Today's Visits", icon: CalendarClock },
    { href: "/portal/roster", label: "Employee Roster", icon: Users },
    { href: "/portal/preregister", label: "Pre-Register", icon: ClipboardList },
  ];

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-border flex items-center gap-3">
        <img src={`${basePath}/logo.svg`} alt="Logo" className="w-8 h-8 text-primary" />
        <div>
          <h1 className="font-bold text-sm tracking-wide text-primary">FRONTDESK</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Client Portal</p>
        </div>
      </div>

      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold">
          {(me?.companyName || me?.displayName || me?.email || "C").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-medium truncate">{me?.companyName || me?.displayName || me?.email}</p>
          <p className="text-xs text-muted-foreground truncate">{me?.displayName || me?.email || ""}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileNavOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 md:py-2 text-sm rounded-md transition-colors ${location === item.href ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 w-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col">
        {sidebarContent}
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden bg-background">
        <header className="flex items-center justify-between md:justify-end px-4 md:px-6 py-3 border-b border-border shrink-0">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <button
                className="md:hidden inline-flex items-center justify-center w-10 h-10 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col bg-card">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {sidebarContent}
            </SheetContent>
          </Sheet>
          <img src={`${basePath}/frontdesk-wordmark.png`} alt="FrontDesk — Guest Management" className="h-7 md:h-8 w-auto" />
        </header>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
