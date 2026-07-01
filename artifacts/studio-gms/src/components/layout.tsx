import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { LayoutDashboard, UserPlus, LogOut, FileText, ClipboardList, ShieldAlert, Users, LogOut as LogOutIcon } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { data: me } = useGetMe();

  const isAdmin = me?.role === "admin";

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  const handleSignOut = () => {
    signOut({ redirectUrl: basePath || "/" });
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/checkin", label: "Check In", icon: UserPlus },
    { href: "/checkout", label: "Check Out", icon: LogOut },
    { href: "/preregistrations", label: "Pre-Registrations", icon: ClipboardList },
  ];

  const adminItems = [
    { href: "/watchlist", label: "Watchlist", icon: ShieldAlert },
    { href: "/audit", label: "Audit Log", icon: FileText },
    { href: "/users", label: "Users", icon: Users },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <img src={`${basePath}/logo.svg`} alt="Logo" className="w-8 h-8 text-primary" />
          <div>
            <h1 className="font-bold text-sm tracking-wide text-primary">STUDIO SEC</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Operations</p>
          </div>
        </div>

        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold">
            {user?.firstName?.charAt(0) || "U"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">{user?.fullName || "Operator"}</p>
            <p className="text-xs text-muted-foreground uppercase">{me?.role || "SECURITY"}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${location === item.href ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}

          {isAdmin && (
            <>
              <div className="mt-6 mb-2 px-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Administration</p>
              </div>
              {adminItems.map((item) => (
                <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${location === item.href ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
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
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}