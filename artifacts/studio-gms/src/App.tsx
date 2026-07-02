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
import KnownGuestsPage from "@/pages/known-guests";
import Preregister from "@/pages/preregister";
import KioskPage from "@/pages/kiosk";

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
  return <Redirect to={user?.role === "kiosk" ? "/kiosk" : "/dashboard"} />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isLoading, isSignedIn, user } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  // Kiosk accounts are locked to the kiosk screen.
  if (user?.role === "kiosk") return <Redirect to="/kiosk" />;
  return <Component />;
}

function KioskRoute() {
  const { isLoading, isSignedIn } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <KioskPage />;
}

function AppRoutes() {
  return (
    <TooltipProvider>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/preregister" component={Preregister} />
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
        <Route path="/alerts">
          <ProtectedRoute component={AlertsPage} />
        </Route>
        <Route path="/kiosk" component={KioskRoute} />
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
