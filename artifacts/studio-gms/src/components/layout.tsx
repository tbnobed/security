import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, UserPlus, LogOut, FileText, ClipboardList, CheckSquare, ShieldAlert, Users, Building2, Bell, BookUser, History, ImageIcon, Menu, LogOut as LogOutIcon, Siren, DoorOpen } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const { user: me, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isAdmin = me?.role === "admin";
  const isSupervisor = me?.role === "supervisor";

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSignOut = async () => {
    await logout();
    setLocation("/sign-in");
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/checkin", label: "Check In", icon: UserPlus },
    { href: "/checkout", label: "Check Out", icon: LogOut },
    { href: "/preregistrations", label: "Pre-Registrations", icon: ClipboardList },
    { href: "/approvals", label: "Approvals", icon: CheckSquare },
    { href: "/known-guests", label: "Known Guests", icon: BookUser },
    { href: "/visits", label: "Visit Log", icon: History },
    { href: "/building", label: "Building", icon: DoorOpen },
    { href: "/evacuation", label: "Evacuation", icon: Siren },
  ];

  // Supervisors get watchlist + audit log; admins get everything.
  const supervisorItems = [
    { href: "/watchlist", label: "Watchlist", icon: ShieldAlert },
    { href: "/audit", label: "Audit Log", icon: FileText },
  ];

  const adminOnlyItems = [
    { href: "/users", label: "Users", icon: Users },
    { href: "/studios", label: "Studios", icon: Building2 },
    { href: "/alerts", label: "Email Alerts", icon: Bell },
    { href: "/branding", label: "Badge Logo", icon: ImageIcon },
  ];

  const adminItems = [
    ...supervisorItems,
    ...(isAdmin ? adminOnlyItems : []),
  ];

  const sidebarContent = (
    <>
      <div className="p-4 border-b border-border flex items-center gap-3">
        <img src={`${basePath}/logo.svg`} alt="Logo" className="w-8 h-8 text-primary" />
        <div>
          <h1 className="font-bold text-sm tracking-wide text-primary">FRONTDESK</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Operations</p>
        </div>
      </div>

      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold">
          {(me?.displayName || me?.email || "U").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-medium truncate">{me?.displayName || me?.email || "Operator"}</p>
          <p className="text-xs text-muted-foreground uppercase">{me?.role || "SECURITY"}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 md:py-2 text-sm rounded-md transition-colors ${location === item.href ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}

        {(isAdmin || isSupervisor) && (
          <>
            <div className="mt-6 mb-2 px-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isAdmin ? "Administration" : "Supervision"}</p>
            </div>
            {adminItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 md:py-2 text-sm rounded-md transition-colors ${location === item.href ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-border">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 w-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
        >
          <LogOutIcon className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden print:block print:h-auto print:overflow-visible">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-border bg-card flex-col print:hidden">
        {sidebarContent}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background print:block print:overflow-visible">
        <header className="flex items-center justify-between md:justify-end px-4 md:px-6 py-3 border-b border-border shrink-0 print:hidden">
          {/* Mobile hamburger */}
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
        <div className="flex-1 overflow-y-auto print:overflow-visible">
          {children}
        </div>
      </main>
    </div>
  );
}
