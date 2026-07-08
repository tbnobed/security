import { useState } from "react";
import { useRoute } from "wouter";
import {
  useGetApprovalByToken,
  useDecideApprovalByToken,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { SITE_NAME } from "@/lib/site";
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { format } from "date-fns";

/**
 * Public one-click approval page opened from approver emails
 * (/approval/:token). Deliberately requires a button press to decide —
 * the emailed link itself never approves anything, so mail-scanner
 * prefetching is harmless.
 */
export default function ApprovalDecisionPage() {
  const [, params] = useRoute("/approval/:token");
  const token = params?.token ?? "";
  // The email's Approve / Deny buttons deep-link with ?action= so the page
  // can highlight the intended choice — a confirming press is still required
  // (mail-scanner prefetch must never decide).
  const intent = new URLSearchParams(window.location.search).get("action");

  const { data: info, isLoading, error, refetch } = useGetApprovalByToken(token, {
    query: { enabled: token.length > 0, retry: false } as any,
  });
  const { mutateAsync: decide, isPending: deciding } = useDecideApprovalByToken();
  const [decided, setDecided] = useState<"approved" | "denied" | null>(null);

  const handleDecide = async (action: "approve" | "deny") => {
    try {
      const result = await decide({ token, data: { action } });
      if (result.state === "approved" || result.state === "denied") {
        setDecided(result.state);
      }
      refetch();
    } catch {
      refetch();
    }
  };

  const state = decided ?? info?.state;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/logo.svg`} alt="" className="h-12 w-12 object-contain" />
          <h1 className="text-xl font-bold tracking-tight">{SITE_NAME}</h1>
          <p className="text-sm text-muted-foreground">Visitor pre-registration approval</p>
        </div>

        <div className="bg-card border border-border rounded-md p-5 space-y-4">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-6">Loading…</p>
          ) : error || !info ? (
            <div className="text-center py-6 space-y-2" data-testid="text-approval-notfound">
              <XCircle className="w-8 h-8 mx-auto text-destructive" />
              <p className="font-medium">Approval link not found</p>
              <p className="text-sm text-muted-foreground">
                This link is invalid or the pre-registration no longer exists.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1 text-sm">
                <div className="text-lg font-semibold" data-testid="text-approval-guest">{info.guestName}</div>
                {info.company && <div className="text-muted-foreground">{info.company}</div>}
                <div className="pt-2">Host: <span className="font-medium">{info.hostName}</span></div>
                {info.purposeOfVisit && <div>Purpose: {info.purposeOfVisit}</div>}
                {info.studios.length > 0 && <div>Studios: {info.studios.join(", ")}</div>}
                <div>Expected: {format(new Date(info.expectedArrival), "EEE, MMM d 'at' h:mm a")}</div>
                <div className="text-xs text-muted-foreground pt-1">Approval step {info.stage}</div>
              </div>

              {info.lateRegistration && state === "pending" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400" data-testid="banner-late">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  Late registration — expected arrival is less than 4 hours away.
                </div>
              )}

              {state === "pending" ? (
                <div className="space-y-2">
                  {(intent === "approve" || intent === "deny") && (
                    <p className="text-sm text-muted-foreground text-center" data-testid="text-confirm-hint">
                      Confirm your decision below.
                    </p>
                  )}
                  <div className="flex gap-3">
                    <Button
                      variant={intent === "deny" ? "outline" : "default"}
                      className={`flex-1 ${intent === "approve" ? "ring-2 ring-primary ring-offset-2" : ""}`}
                      onClick={() => handleDecide("approve")}
                      disabled={deciding}
                      data-testid="button-token-approve"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                    </Button>
                    <Button
                      variant={intent === "deny" ? "destructive" : "outline"}
                      className={`flex-1 ${
                        intent === "deny"
                          ? "ring-2 ring-destructive ring-offset-2"
                          : "text-destructive hover:text-destructive"
                      }`}
                      onClick={() => handleDecide("deny")}
                      disabled={deciding}
                      data-testid="button-token-deny"
                    >
                      <XCircle className="w-4 h-4 mr-2" /> Deny
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className={`flex items-center gap-2 rounded-md p-3 text-sm font-medium ${
                    state === "approved"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : state === "denied"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                  }`}
                  data-testid="banner-decided"
                >
                  {state === "approved" ? (
                    <><ShieldCheck className="w-4 h-4" /> This pre-registration has been approved.</>
                  ) : state === "denied" ? (
                    <><XCircle className="w-4 h-4" /> This pre-registration has been denied.</>
                  ) : (
                    <>This approval step has already been handled.</>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
