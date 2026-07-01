import { useState } from "react";
import { useSignIn } from "@clerk/react";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage() {
  const { signIn, errors, fetchStatus } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const loading = fetchStatus === "fetching";

  const getErrorMessage = (): string | null => {
    if (localError) return localError;
    const fieldError = errors?.fields?.password ?? errors?.fields?.identifier;
    if (!fieldError) return null;
    return fieldError.longMessage ?? fieldError.message ?? "Authentication failed.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const { error } = await signIn.password({
      identifier: email.trim(),
      password,
    });

    console.log("[signin] password() done", {
      error,
      status: signIn.status,
      createdSessionId: signIn.createdSessionId,
      firstFactor: signIn.firstFactorVerification?.status,
    });

    if (error) {
      setLocalError((error as { message?: string; longMessage?: string }).longMessage
        ?? (error as { message?: string }).message
        ?? "Invalid email or password.");
      return;
    }

    const { error: finalizeError } = await signIn.finalize();

    if (finalizeError) {
      setLocalError((finalizeError as { message?: string; longMessage?: string }).longMessage
        ?? (finalizeError as { message?: string }).message
        ?? "Sign-in could not be completed. Contact your administrator.");
    }
  };

  const errorMsg = getErrorMessage();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Studio Security</h1>
          <p className="text-sm text-muted-foreground mt-1 uppercase tracking-widest">Operations Console</p>
        </div>

        <div className="bg-card border border-border rounded-md p-6 shadow-lg">
          <div className="mb-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Authorized personnel only</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@studio.com"
                required
                className="mt-1.5 bg-background border-border"
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="bg-background border-border pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
                {errorMsg}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Contact your administrator to request access.
        </p>
      </div>
    </div>
  );
}
