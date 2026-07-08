import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useKioskListPreregistrations,
  useKioskCheckin,
  useUploadPhoto,
  ApiError,
} from "@workspace/api-client-react";
import type { KioskPreregistration } from "@workspace/api-client-react";
import { Loader2, UserCheck, Camera, ShieldAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhotoCapture } from "@/components/photo-capture";
import { VisitorBadge, type VisitorBadgeData } from "@/components/visitor-badge";
import { SITE_NAME } from "@/lib/site";
import logoUrl from "/logo.svg";

type Step = "welcome" | "search" | "photo" | "badge" | "desk";

const IDLE_RESET_MS = 90_000;
const BADGE_RESET_MS = 45_000;
const DESK_RESET_MS = 20_000;

export default function KioskPage() {
  const [step, setStep] = useState<Step>("welcome");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<KioskPreregistration | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [badge, setBadge] = useState<VisitorBadgeData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { mutateAsync: uploadPhoto } = useUploadPhoto();
  const { mutateAsync: kioskCheckin } = useKioskCheckin();

  const trimmed = query.trim();
  const { data: matches, isFetching } = useKioskListPreregistrations(
    { q: trimmed },
    { query: { enabled: step === "search" && trimmed.length >= 2 } } as any,
  );

  const reset = useCallback(() => {
    setStep("welcome");
    setQuery("");
    setSelected(null);
    setPhoto(null);
    setBadge(null);
    setSubmitting(false);
    setErrorMsg(null);
  }, []);

  // Idle auto-reset so the kiosk always returns to the welcome screen.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (step !== "welcome") {
      const ms =
        step === "badge" ? BADGE_RESET_MS : step === "desk" ? DESK_RESET_MS : IDLE_RESET_MS;
      idleTimer.current = setTimeout(reset, ms);
    }
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [step, query, photo, reset]);

  const handleCheckin = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      let photoUrl: string | undefined;
      if (photo) {
        try {
          const base64 = photo.split(",")[1];
          const result = await uploadPhoto({ data: { imageData: base64 } });
          photoUrl = result.photoUrl;
        } catch {
          // continue without photo rather than dead-ending the guest
        }
      }
      const guest = await kioskCheckin({ data: { preregistrationId: selected.id, photoUrl } });
      setBadge({
        badgeId: guest.badgeId,
        name: guest.name,
        company: guest.company,
        host: guest.hostName,
        site: guest.site,
        studios: guest.studios ?? [],
        purpose: guest.purposeOfVisit,
        checkinAt: guest.checkinAt,
        expectedDeparture: guest.expectedDeparture ?? null,
        photo: photo ?? guest.photoUrl ?? null,
      });
      setStep("badge");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setStep("desk");
      } else if (err instanceof ApiError && err.status === 404) {
        setErrorMsg("This pre-registration is no longer available. Please see the security desk.");
      } else {
        setErrorMsg("Something went wrong. Please try again or see the security desk.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" data-testid="kiosk-page">
      <header className="flex items-center justify-center gap-3 py-6 border-b border-border">
        <img src={logoUrl} alt="" className="w-10 h-10" />
        <div className="text-center">
          <h1 className="text-xl font-bold leading-tight">Visitor Self Check-In</h1>
          <p className="text-sm text-muted-foreground">{SITE_NAME}</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-2xl mx-auto">
        {step === "welcome" && (
          <div className="text-center space-y-8">
            <UserCheck className="w-24 h-24 mx-auto text-primary" />
            <div className="space-y-2">
              <h2 className="text-3xl font-bold">Welcome!</h2>
              <p className="text-lg text-muted-foreground">
                Expected today? Check yourself in, then collect your badge at the security desk.
              </p>
            </div>
            <Button
              size="lg"
              className="h-16 px-12 text-xl"
              onClick={() => setStep("search")}
              data-testid="button-kiosk-start"
            >
              Tap to Check In
            </Button>
            <p className="text-xs text-muted-foreground">
              By checking in you provide your name and photo for facility security.{" "}
              <Link href="/privacy" className="underline underline-offset-2" data-testid="link-privacy-kiosk">
                Privacy Notice
              </Link>
            </p>
          </div>
        )}

        {step === "search" && (
          <div className="w-full space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold">Find your name</h2>
              <p className="text-muted-foreground">Type your name as it was pre-registered.</p>
            </div>
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Your full name…"
              className="h-16 text-2xl text-center"
              data-testid="input-kiosk-name"
            />
            <div className="space-y-3 min-h-[120px]">
              {isFetching && trimmed.length >= 2 && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isFetching && trimmed.length >= 2 && (matches?.length ?? 0) === 0 && (
                <p className="text-center text-muted-foreground py-4" data-testid="text-kiosk-no-match">
                  No expected visit found for that name today.
                  <br />
                  Please see the security desk for assistance.
                </p>
              )}
              {(matches ?? []).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelected(m);
                    setStep("photo");
                  }}
                  className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-6 py-5 text-left hover:border-primary transition-colors"
                  data-testid={`kiosk-prereg-${m.id}`}
                >
                  <div>
                    <div className="text-xl font-semibold">{m.guestName}</div>
                    <div className="text-muted-foreground">
                      {m.company} · Host: {m.hostName}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Expected{" "}
                    {new Date(m.expectedArrival).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex justify-center">
              <Button variant="ghost" size="lg" onClick={reset} data-testid="button-kiosk-cancel-search">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "photo" && selected && (
          <div className="w-full space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold">
                Hi, {selected.guestName.split(" ")[0]}! <Camera className="inline w-6 h-6 mb-1" />
              </h2>
              <p className="text-muted-foreground">Take a photo for your visitor badge.</p>
            </div>
            <PhotoCapture photo={photo} onChange={setPhoto} />
            {errorMsg && (
              <p className="text-center text-destructive" data-testid="text-kiosk-error">
                {errorMsg}
              </p>
            )}
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                className="h-14 px-10 text-lg"
                onClick={handleCheckin}
                disabled={submitting || !photo}
                data-testid="button-kiosk-checkin"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Check In
              </Button>
              <button
                onClick={handleCheckin}
                disabled={submitting}
                className="text-sm text-muted-foreground underline disabled:opacity-50"
                data-testid="button-kiosk-skip-photo"
              >
                Continue without photo
              </button>
              <Button variant="ghost" onClick={reset} data-testid="button-kiosk-cancel-photo">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === "badge" && badge && (
          <div className="w-full flex flex-col items-center space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold">You're checked in!</h2>
              <p className="text-muted-foreground">
                Please collect your printed visitor badge from the security desk, then wear it
                visibly while on site.
              </p>
            </div>
            <VisitorBadge data={badge} />
            <Button size="lg" onClick={reset} data-testid="button-kiosk-done">
              Done
            </Button>
          </div>
        )}

        {step === "desk" && (
          <div className="text-center space-y-6" data-testid="kiosk-desk-screen">
            <ShieldAlert className="w-20 h-20 mx-auto text-amber-500" />
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Please see the security desk</h2>
              <p className="text-lg text-muted-foreground">
                A member of our security team will complete your check-in.
              </p>
            </div>
            <Button size="lg" variant="outline" onClick={reset} data-testid="button-kiosk-desk-done">
              <RotateCcw className="w-5 h-5 mr-2" /> Back to Start
            </Button>
          </div>
        )}
      </main>

      <footer className="py-4 text-center text-xs text-muted-foreground border-t border-border">
        Self-service kiosk · If you need help, please ask at the security desk.
      </footer>
    </div>
  );
}
