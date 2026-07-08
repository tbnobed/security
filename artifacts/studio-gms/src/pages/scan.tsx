import { useCallback, useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useSubmitScanResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, CheckCircle2, Loader2, RefreshCw, ScanLine, XCircle } from "lucide-react";

type Step = "scan" | "confirm" | "photo" | "sending" | "done" | "error";

/**
 * Parse the AAMVA payload of a US driver's license / state ID PDF417 barcode.
 * Extracts the name ONLY — nothing else is read or transmitted.
 */
export function parseAamvaName(raw: string): string | null {
  const field = (code: string): string | null => {
    const m = raw.match(new RegExp(`(?:^|\\n|\\r)${code}([^\\n\\r]*)`));
    const v = m?.[1]?.trim();
    return v && v.length > 0 ? v : null;
  };
  const clean = (s: string) => s.replace(/,+$/, "").trim();

  const last = field("DCS");
  const first = field("DAC") ?? field("DCT");
  const middle = field("DAD");
  if (first && last) {
    const parts = [clean(first)];
    if (middle && !/^(NONE|N\/A|X+)$/i.test(clean(middle))) parts.push(clean(middle));
    parts.push(clean(last));
    return parts.join(" ").replace(/\s+/g, " ");
  }

  // Older AAMVA versions: DAA = full name, usually "LAST,FIRST,MIDDLE"
  const daa = field("DAA");
  if (daa) {
    const segs = daa.split(/[,$]/).map((s) => s.trim()).filter(Boolean);
    if (segs.length >= 2) {
      const [lastName, firstName, ...rest] = segs;
      return [firstName, ...rest, lastName].join(" ").replace(/\s+/g, " ");
    }
    return daa;
  }
  return null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_, p, c: string) => p + c.toUpperCase());
}

export default function ScanPage() {
  const [, params] = useRoute("/scan/:id");
  const sessionId = params?.id ?? "";

  const [step, setStep] = useState<Step>("scan");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [cameraError, setCameraError] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  const { mutateAsync: submitScan } = useSubmitScanResult();

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      return true;
    } catch {
      setCameraError(true);
      return false;
    }
  }, []);

  // Barcode scan loop (step === "scan")
  useEffect(() => {
    if (step !== "scan" || manualEntry) return;
    let cancelled = false;

    (async () => {
      const ok = await startCamera();
      if (!ok || cancelled) return;
      const { readBarcodes } = await import("zxing-wasm/reader");
      scanningRef.current = true;

      const tick = async () => {
        if (cancelled || !scanningRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(video, 0, 0);
          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const results = await readBarcodes(imageData, {
              formats: ["PDF417"],
              tryHarder: true,
              maxNumberOfSymbols: 1,
            });
            const text = results[0]?.text;
            if (text && !cancelled) {
              const parsed = parseAamvaName(text);
              if (parsed) {
                stopCamera();
                setName(titleCase(parsed));
                setStep("confirm");
                return;
              }
            }
          } catch {
            /* frame decode failed — keep scanning */
          }
        }
        if (!cancelled && scanningRef.current) setTimeout(tick, 250);
      };
      void tick();
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [step, manualEntry, startCamera, stopCamera]);

  // Live guest photo (step === "photo")
  useEffect(() => {
    if (step !== "photo" || photo) return;
    let cancelled = false;
    (async () => {
      const ok = await startCamera();
      if (!ok || cancelled) return;
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [step, photo, startCamera, stopCamera]);

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg", 0.8));
    stopCamera();
  };

  const handleSubmit = async () => {
    setStep("sending");
    try {
      await submitScan({
        data: {
          name: name.trim(),
          photoData: photo ? photo.split(",")[1] : undefined,
        },
        id: sessionId,
      });
      setStep("done");
    } catch (err: unknown) {
      const apiErr = err as { response?: { status?: number } };
      setErrorMsg(
        apiErr?.response?.status === 404
          ? "This scan link has expired. Ask the desk to generate a new QR code."
          : "Could not send the scan to the desk. Check your connection and try again.",
      );
      setStep("error");
    }
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="min-h-screen bg-background text-foreground dark flex flex-col">
      <header className="p-4 border-b border-border flex items-center gap-2">
        <ScanLine className="w-5 h-5 text-primary" />
        <h1 className="font-semibold">ID Scan</h1>
      </header>

      <main className="flex-1 p-4 flex flex-col items-center justify-center gap-4 max-w-md w-full mx-auto">
        {step === "scan" && (
          <>
            {!manualEntry ? (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  Point the camera at the <strong>barcode on the back</strong> of the guest's
                  driver's license or state ID.
                </p>
                <div className="w-full aspect-[4/3] bg-muted rounded-md overflow-hidden relative">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-6 border-2 border-primary/60 rounded pointer-events-none" />
                </div>
                {cameraError ? (
                  <div className="text-sm text-destructive text-center space-y-2">
                    <p>Camera unavailable. Allow camera access and reload, or enter the name manually.</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Scanning… only the name is read from the ID.
                  </p>
                )}
                <Button variant="ghost" size="sm" onClick={() => { stopCamera(); setManualEntry(true); }}>
                  Enter name manually instead
                </Button>
              </>
            ) : (
              <div className="w-full space-y-3">
                <Label htmlFor="manual-name">Guest full name</Label>
                <Input
                  id="manual-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={name.trim().length < 2} onClick={() => setStep("photo")}>
                    Continue
                  </Button>
                  <Button variant="outline" onClick={() => setManualEntry(false)}>
                    <ScanLine className="w-4 h-4 mr-1" /> Scan instead
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {step === "confirm" && (
          <div className="w-full space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">ID scanned</span>
            </div>
            <div>
              <Label htmlFor="scanned-name">Guest name (edit if needed)</Label>
              <Input
                id="scanned-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={name.trim().length < 2} onClick={() => setStep("photo")}>
                Looks right — take photo
              </Button>
              <Button variant="outline" onClick={() => { setName(""); setStep("scan"); }}>
                <RefreshCw className="w-4 h-4 mr-1" /> Rescan
              </Button>
            </div>
          </div>
        )}

        {step === "photo" && (
          <div className="w-full space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Now take a photo of <strong>{name || "the guest"}</strong> for their badge.
            </p>
            <div className="w-full aspect-[4/3] bg-muted rounded-md overflow-hidden">
              {photo ? (
                <img src={photo} alt="Guest" className="w-full h-full object-cover" />
              ) : (
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              )}
            </div>
            {cameraError && !photo && (
              <p className="text-sm text-destructive text-center">Camera unavailable — you can send without a photo.</p>
            )}
            <div className="flex gap-2">
              {!photo ? (
                <>
                  <Button className="flex-1" onClick={capturePhoto} disabled={cameraError}>
                    <Camera className="w-4 h-4 mr-1" /> Capture
                  </Button>
                  <Button variant="outline" onClick={handleSubmit}>
                    Skip photo
                  </Button>
                </>
              ) : (
                <>
                  <Button className="flex-1" onClick={handleSubmit}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Send to desk
                  </Button>
                  <Button variant="outline" onClick={() => setPhoto(null)}>
                    <RefreshCw className="w-4 h-4 mr-1" /> Retake
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {step === "sending" && (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Sending to the desk…</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-12 h-12 text-primary" />
            <h2 className="text-lg font-semibold">Sent to the desk</h2>
            <p className="text-sm text-muted-foreground">
              The check-in form has been filled in. You can close this page.
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <XCircle className="w-12 h-12 text-destructive" />
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" onClick={() => setStep(photo || name ? "photo" : "scan")}>
              Try again
            </Button>
          </div>
        )}
      </main>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
