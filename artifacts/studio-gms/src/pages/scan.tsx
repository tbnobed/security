import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
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
  const [insecureContext, setInsecureContext] = useState(false);
  const [scannerError, setScannerError] = useState(false);

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
    // iOS Safari (and modern Chrome/Android) only expose the camera in a
    // secure context — over plain HTTP, navigator.mediaDevices is undefined.
    if (!navigator.mediaDevices?.getUserMedia) {
      setInsecureContext(!window.isSecureContext);
      setCameraError(true);
      return false;
    }
    try {
      // Request the highest resolution available — a driver's-license PDF417
      // is extremely dense and reliably decodes only with plenty of pixels.
      // Phones clamp `ideal` to their real max (typically 4K on the rear cam).
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 3840 }, height: { ideal: 2160 } },
      });
      streamRef.current = stream;
      // Ask for continuous autofocus where supported (Android Chrome honors
      // this; iOS Safari ignores unknown constraints — safe either way).
      const [track] = stream.getVideoTracks();
      if (track) {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          });
        } catch {
          /* focus constraint unsupported — fine */
        }
      }
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
    setScannerError(false);

    (async () => {
      const ok = await startCamera();
      if (!ok || cancelled) return;
      let readBarcodes: typeof import("zxing-wasm/reader").readBarcodes;
      try {
        // Serve the WASM binary from our own origin instead of the default
        // jsDelivr CDN — required for self-hosted/offline deploys and iOS
        // content blockers, otherwise decoding silently never starts.
        const [mod, wasm] = await Promise.all([
          import("zxing-wasm/reader"),
          import("zxing-wasm/reader/zxing_reader.wasm?url"),
        ]);
        mod.prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? wasm.default : prefix + path,
          },
        });
        readBarcodes = mod.readBarcodes;
        // Warm-up decode: forces WASM instantiation NOW so a broken module
        // surfaces as a visible error instead of silently failing every frame.
        await readBarcodes(new ImageData(2, 2), { formats: ["PDF417"] });
      } catch {
        if (!cancelled) {
          setScannerError(true);
          stopCamera();
        }
        return;
      }
      if (cancelled) return;
      scanningRef.current = true;

      // Decode a bounded-size image, never the raw (possibly 4K) frame:
      // full 4K RGBA frames are ~33MB each and can OOM/stall mobile browsers.
      // Alternate between the center guide-box region (best pixel density
      // when the guest fills the frame) and the full frame downscaled (in
      // case they hold the license further away).
      const DECODE_LONG_EDGE = 1600;
      let frameNo = 0;
      let consecutiveDecodeErrors = 0;

      const tick = async () => {
        if (cancelled || !scanningRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.videoWidth > 0) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const useCrop = frameNo % 2 === 0;
          frameNo += 1;
          // Center crop ≈ the on-screen guide box (80% × 60% of the frame).
          const sw = useCrop ? Math.round(vw * 0.8) : vw;
          const sh = useCrop ? Math.round(vh * 0.6) : vh;
          const sx = Math.round((vw - sw) / 2);
          const sy = Math.round((vh - sh) / 2);
          const scale = Math.min(1, DECODE_LONG_EDGE / Math.max(sw, sh));
          canvas.width = Math.round(sw * scale);
          canvas.height = Math.round(sh * scale);
          const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const results = await readBarcodes(imageData, {
              formats: ["PDF417"],
              tryHarder: true,
              maxNumberOfSymbols: 1,
            });
            consecutiveDecodeErrors = 0;
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
            // A single bad frame is fine, but persistent decode exceptions
            // mean the decoder is broken on this device — surface it instead
            // of silently scanning forever.
            consecutiveDecodeErrors += 1;
            if (consecutiveDecodeErrors >= 10 && !cancelled) {
              setScannerError(true);
              stopCamera();
              return;
            }
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
    // Cap the badge photo at 1280px long edge — the camera may be running at
    // 4K for barcode scanning, and a full-res JPEG would bloat the upload.
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
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
                {insecureContext ? (
                  <div className="text-sm text-destructive text-center space-y-2" data-testid="text-insecure-context">
                    <p>
                      The camera can't be used because this page was opened over an insecure
                      (HTTP) connection — iPhones and modern browsers require HTTPS for camera
                      access. Enter the name manually below, or ask your administrator to serve
                      FrontDesk over HTTPS.
                    </p>
                  </div>
                ) : scannerError ? (
                  <div className="text-sm text-destructive text-center space-y-2" data-testid="text-scanner-error">
                    <p>The barcode scanner failed to load on this device. Enter the name manually instead.</p>
                  </div>
                ) : cameraError ? (
                  <div className="text-sm text-destructive text-center space-y-2">
                    <p>Camera unavailable. Allow camera access and reload, or enter the name manually.</p>
                  </div>
                ) : (
                  <div className="space-y-1 text-center">
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" /> Scanning… only the name is read from the ID.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fill the frame with the barcode, hold steady, and avoid glare — move slightly
                      closer or farther until it focuses.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  The barcode is read on this device only — license data never leaves the phone.{" "}
                  <Link href="/privacy" className="underline underline-offset-2" data-testid="link-privacy-scan">
                    Privacy Notice
                  </Link>
                </p>
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
