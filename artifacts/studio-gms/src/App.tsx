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
import Preregister from "@/pages/preregister";

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
  const { isLoading, isSignedIn } = useAuth();
  if (isLoading) return <AuthLoading />;
  return <Redirect to={isSignedIn ? "/dashboard" : "/sign-in"} />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { isLoading, isSignedIn } = useAuth();
  if (isLoading) return <AuthLoading />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <Component />;
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
