import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import SignInPage from "@/pages/sign-in";
import Dashboard from "@/pages/dashboard";
import CheckIn from "@/pages/checkin";
import CheckOut from "@/pages/checkout";
import Preregistrations from "@/pages/preregistrations";
import Watchlist from "@/pages/watchlist";
import Audit from "@/pages/audit";
import UsersPage from "@/pages/users";
import StudiosPage from "@/pages/studios";
import AlertsPage from "@/pages/alerts";
import BrandingPage from "@/pages/branding";
import KnownGuestsPage from "@/pages/known-guests";
import VisitLogPage from "@/pages/visit-log";
import Preregister from "@/pages/preregister";
import ScanPage from "@/pages/scan";
import PrivacyPage from "@/pages/privacy";
import KioskPage from "@/pages/kiosk";
import PortalPage from "@/pages/portal";
import PortalRosterPage from "@/pages/portal-roster";
import PortalPreregisterPage from "@/pages/portal-preregister";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AuthLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function HomeRedirect() {
  const { isLoading, isSignedIn, user } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (user?.role === "kiosk") return <Redirect to="/kiosk" />;
  if (user?.role === "client") return <Redirect to="/portal" />;
  return <Redirect to="/dashboard" />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isLoading, isSignedIn, user } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  // Kiosk accounts are locked to the kiosk screen.
  if (user?.role === "kiosk") return <Redirect to="/kiosk" />;
  // Client accounts are locked to the client portal.
  if (user?.role === "client") return <Redirect to="/portal" />;
  return <Component />;
}

function ClientRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isLoading, isSignedIn, user } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (user?.role === "kiosk") return <Redirect to="/kiosk" />;
  if (user?.role !== "client") return <Redirect to="/dashboard" />;
  return <Component />;
}

function KioskRoute() {
  const { isLoading, isSignedIn, user } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  // Client-portal accounts have no business on the kiosk screen.
  if (user?.role === "client") return <Redirect to="/portal" />;
  return <KioskPage />;
}

function AppRoutes() {
  return (
    <TooltipProvider>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/preregister" component={Preregister} />
        <Route path="/scan/:id" component={ScanPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/sign-in" component={SignInPage} />
        <Route path="/sign-up">
          <Redirect to="/sign-in" />
        </Route>
        <Route path="/dashboard">
          <ProtectedRoute component={Dashboard} />
        </Route>
        <Route path="/checkin">
          <ProtectedRoute component={CheckIn} />
        </Route>
        <Route path="/checkout">
          <ProtectedRoute component={CheckOut} />
        </Route>
        <Route path="/preregistrations">
          <ProtectedRoute component={Preregistrations} />
        </Route>
        <Route path="/known-guests">
          <ProtectedRoute component={KnownGuestsPage} />
        </Route>
        <Route path="/visits">
          <ProtectedRoute component={VisitLogPage} />
        </Route>
        <Route path="/watchlist">
          <ProtectedRoute component={Watchlist} />
        </Route>
        <Route path="/audit">
          <ProtectedRoute component={Audit} />
        </Route>
        <Route path="/users">
          <ProtectedRoute component={UsersPage} />
        </Route>
        <Route path="/studios">
          <ProtectedRoute component={StudiosPage} />
        </Route>
        <Route path="/branding">
          <ProtectedRoute component={BrandingPage} />
        </Route>
        <Route path="/alerts">
          <ProtectedRoute component={AlertsPage} />
        </Route>
        <Route path="/kiosk" component={KioskRoute} />
        <Route path="/portal">
          <ClientRoute component={PortalPage} />
        </Route>
        <Route path="/portal/roster">
          <ClientRoute component={PortalRosterPage} />
        </Route>
        <Route path="/portal/preregister">
          <ClientRoute component={PortalPreregisterPage} />
        </Route>
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </TooltipProvider>
  );
}

function App() {
  return (
    <div className="dark">
      <WouterRouter base={basePath}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </QueryClientProvider>
      </WouterRouter>
    </div>
  );
}

export default App;
