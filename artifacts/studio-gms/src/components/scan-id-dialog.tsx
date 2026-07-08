import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { getCancelScanSessionUrl, useCreateScanSession, useGetScanSession } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Smartphone } from "lucide-react";

interface ScanIdDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once when the phone finishes the scan. */
  onScanned: (result: { name: string; photoUrl: string | null }) => void;
}

/**
 * Desk-side dialog: creates a scan session, shows a QR code the officer scans
 * with the paired phone, and polls until the phone submits the guest's data.
 */
export function ScanIdDialog({ open, onOpenChange, onScanned }: ScanIdDialogProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const appliedRef = useRef(false);
  // Mirrors sessionId so unload/unmount handlers can cancel without stale closures.
  const activeSessionRef = useRef<string | null>(null);
  // Bumped on every close/cancel so an in-flight create that resolves late
  // knows its session is already unwanted and cancels it immediately.
  const generationRef = useRef(0);

  const { mutateAsync: createSession, isPending: creating } = useCreateScanSession();

  // Fire-and-forget DELETE for a specific session id. keepalive lets the
  // request survive a page refresh/navigation; idempotent on the server.
  const cancelById = useCallback((id: string) => {
    try {
      void fetch(getCancelScanSessionUrl(id), {
        method: "DELETE",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* best-effort */
    }
  }, []);

  // Invalidate the currently-active QR token (if any) and obsolete any
  // in-flight session creation.
  const cancelSession = useCallback(() => {
    generationRef.current += 1;
    const id = activeSessionRef.current;
    if (!id) return;
    activeSessionRef.current = null;
    cancelById(id);
  }, [cancelById]);

  const startSession = async () => {
    cancelSession();
    const generation = generationRef.current;
    appliedRef.current = false;
    setExpired(false);
    try {
      const session = await createSession();
      if (generation !== generationRef.current) {
        // Dialog closed / page navigated away while the create was in flight —
        // this token was never shown and must not stay valid.
        cancelById(session.id);
        return;
      }
      activeSessionRef.current = session.id;
      setSessionId(session.id);
      setExpiresAt(new Date(session.expiresAt).getTime());
    } catch {
      setSessionId(null);
    }
  };

  useEffect(() => {
    if (open) {
      void startSession();
    } else {
      cancelSession();
      setSessionId(null);
      setExpiresAt(null);
      setExpired(false);
      appliedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Refresh / tab close / navigation away while the QR is showing → invalidate
  // the token immediately instead of letting it live out its server-side TTL.
  useEffect(() => {
    if (!open) return;
    const handler = () => cancelSession();
    window.addEventListener("pagehide", handler);
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("pagehide", handler);
      window.removeEventListener("beforeunload", handler);
    };
  }, [open, cancelSession]);

  // Component unmount (SPA navigation away from the check-in page).
  useEffect(() => () => cancelSession(), [cancelSession]);

  // Local expiry countdown → show "generate new code"
  useEffect(() => {
    if (!open || !expiresAt) return;
    const t = setInterval(() => {
      if (Date.now() >= expiresAt) setExpired(true);
    }, 1000);
    return () => clearInterval(t);
  }, [open, expiresAt]);

  const { data: session, isError: pollError } = useGetScanSession(
    sessionId ?? "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: open && !!sessionId && !expired, refetchInterval: 2000, retry: false } as any },
  );

  // Session gone server-side (expired or API restarted) → offer a new code immediately.
  useEffect(() => {
    if (pollError) setExpired(true);
  }, [pollError]);

  useEffect(() => {
    if (session?.status === "completed" && session.result && !appliedRef.current) {
      appliedRef.current = true;
      onScanned({ name: session.result.name, photoUrl: session.result.photoUrl ?? null });
      onOpenChange(false);
    }
  }, [session, onScanned, onOpenChange]);

  const scanUrl = sessionId
    ? `${window.location.origin}${import.meta.env.BASE_URL}scan/${sessionId}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> Scan Guest ID
          </DialogTitle>
          <DialogDescription>
            Scan this QR code with the desk phone, then scan the barcode on the back of the
            guest's driver's license. The form fills in automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {creating || (!scanUrl && !expired) ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">Preparing scan session…</p>
            </div>
          ) : expired ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground">This code has expired.</p>
              <Button size="sm" onClick={() => void startSession()}>
                <RefreshCw className="w-4 h-4 mr-1" /> Generate new code
              </Button>
            </div>
          ) : scanUrl ? (
            <>
              <div className="bg-white p-3 rounded-md" data-testid="scan-qr-code" data-scan-url={scanUrl}>
                <QRCode value={scanUrl} size={192} />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Waiting for the phone…
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6">
              <p className="text-sm text-destructive">Could not start a scan session.</p>
              <Button size="sm" variant="outline" onClick={() => void startSession()}>
                <RefreshCw className="w-4 h-4 mr-1" /> Retry
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
