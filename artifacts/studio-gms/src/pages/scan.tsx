import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { getGetScanSessionStatusUrl, useSubmitScanResult } from "@workspace/api-client-react";
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

type ReadBarcodesFn = typeof import("zxing-wasm/reader").readBarcodes;

// Load + warm up zxing-wasm exactly once (shared by the live scan loop and
// the still-photo fallback). Serves the WASM binary from our own origin
// instead of the default jsDelivr CDN — required for self-hosted/offline
// deploys and iOS content blockers.
let zxingPromise: Promise<ReadBarcodesFn | null> | null = null;
function loadZxing(): Promise<ReadBarcodesFn | null> {
  zxingPromise ??= (async () => {
    try {
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
      // Warm-up decode: forces WASM instantiation NOW so a broken module
      // surfaces as a visible error instead of silently failing every frame.
      await mod.readBarcodes(new ImageData(2, 2), { formats: ["PDF417"] });
      return mod.readBarcodes;
    } catch {
      zxingPromise = null;
      return null;
    }
  })();
  return zxingPromise;
}

export default function ScanPage() {
  const [, params] = useRoute("/scan/:id");
  const sessionId = params?.id ?? "";

  const [step, setStep] = useState<Step>("scan");
  // null = still verifying with the server; false = the desk cancelled the
  // session (navigated away / closed the dialog), it expired, or it was
  // already used — show a dead-link screen instead of the scanner.
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [cameraError, setCameraError] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [insecureContext, setInsecureContext] = useState(false);
  const [scannerError, setScannerError] = useState(false);
  const [camRes, setCamRes] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  // Still-photo fallback: offered after a few seconds of unsuccessful live
  // scanning (or immediately when the camera/scanner is unavailable). The
  // native camera app can macro-focus in ways getUserMedia video cannot, so
  // a deliberate still photo decodes far more reliably than live frames.
  const [stillOffer, setStillOffer] = useState(false);
  const [stillBusy, setStillBusy] = useState(false);
  const [stillFailed, setStillFailed] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const stillInputRef = useRef<HTMLInputElement>(null);
  // Mirrors stillBusy for the live scan loop (refs avoid stale closures):
  // while a still photo is being decoded the live loop must idle, so the two
  // decoders never run concurrently on a memory-constrained phone.
  const stillBusyRef = useRef(false);

  const { mutateAsync: submitScan } = useSubmitScanResult();

  const applyZoom = useCallback(async (level: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: level } as MediaTrackConstraintSet] });
      setZoomLevel(level);
    } catch {
      /* zoom rejected — leave as-is */
    }
  }, []);

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
      if (track) {
        const s = track.getSettings();
        if (s.width && s.height) setCamRes(`${s.width}×${s.height}`);
        // Detect optical/digital zoom support — zooming in is the single most
        // effective fix for dense PDF417 barcodes: the guest can hold the
        // license at a distance the lens can actually focus at while keeping
        // plenty of pixels on the barcode.
        try {
          const caps = track.getCapabilities?.() as { zoom?: { min?: number; max?: number } } | undefined;
          const z = caps?.zoom;
          if (z && typeof z.max === "number" && z.max > 1) {
            setZoomMax(Math.min(z.max, 5));
            setZoomLevel(1);
          } else {
            setZoomMax(1);
          }
        } catch {
          setZoomMax(1);
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

  // Verify the token with the server on load AND every time the page becomes
  // visible again (reload, back-navigation, returning from the camera app).
  // The desk invalidates the session when its dialog closes or the operator
  // navigates away — a reloaded phone page must show a dead link, not a
  // working scanner. Only a definitive 404 kills the page; transient network
  // errors / rate limiting leave the current state alone.
  useEffect(() => {
    if (!sessionId) {
      setSessionValid(false);
      return;
    }
    if (step === "sending" || step === "done") return;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await fetch(getGetScanSessionStatusUrl(sessionId), { cache: "no-store" });
        if (cancelled) return;
        if (r.status === 404) setSessionValid(false);
        else if (r.ok) setSessionValid(true);
      } catch {
        /* offline / transient — keep current state */
      }
    };
    void check();
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [sessionId, step]);

  // Session died (desk cancelled / expired) → release the camera immediately.
  useEffect(() => {
    if (sessionValid === false) stopCamera();
  }, [sessionValid, stopCamera]);

  // Offer the still-photo fallback after 5s of live scanning without a hit.
  useEffect(() => {
    if (step !== "scan" || manualEntry || sessionValid !== true) {
      setStillOffer(false);
      return;
    }
    const t = setTimeout(() => setStillOffer(true), 5000);
    return () => clearTimeout(t);
  }, [step, manualEntry, sessionValid]);

  // Decode a still photo taken with the native camera app (file input with
  // capture). Native camera stills are sharp (real autofocus/macro) and
  // high-res — the most reliable way to read a dense license PDF417.
  const decodeStillPhoto = useCallback(
    async (file: File) => {
      stillBusyRef.current = true;
      setStillBusy(true);
      setStillFailed(false);
      try {
        // Prefer createImageBitmap; fall back to an <img> element for older
        // browsers / unsupported codecs (both are valid CanvasImageSource /
        // ImageBitmapSource inputs).
        let source: ImageBitmap | HTMLImageElement;
        let cleanup: () => void;
        try {
          const bmp = await createImageBitmap(file);
          source = bmp;
          cleanup = () => bmp.close();
        } catch {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.src = url;
          await img.decode();
          source = img;
          cleanup = () => URL.revokeObjectURL(url);
        }
        const srcW = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
        const srcH = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
        try {
          let text: string | undefined;

          // Native BarcodeDetector first, if this browser has one with pdf417.
          try {
            const BD = (
              window as unknown as {
                BarcodeDetector?: {
                  new (opts: { formats: string[] }): {
                    detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
                  };
                  getSupportedFormats?: () => Promise<string[]>;
                };
              }
            ).BarcodeDetector;
            if (BD?.getSupportedFormats) {
              const fmts = await BD.getSupportedFormats();
              if (fmts.includes("pdf417")) {
                const det = new BD({ formats: ["pdf417"] });
                text = (await det.detect(source))[0]?.rawValue;
              }
            }
          } catch {
            /* fall through to zxing */
          }

          if (text === undefined) {
            const readBarcodes = await loadZxing();
            if (readBarcodes) {
              const work = document.createElement("canvas");
              const ctx = work.getContext("2d", { willReadFrequently: true })!;
              // Two passes: near-full resolution first (dense barcodes need
              // pixels), then a smaller pass (helps slightly blurry shots).
              for (const cap of [3200, 2000]) {
                const scale = Math.min(1, cap / Math.max(srcW, srcH));
                work.width = Math.round(srcW * scale);
                work.height = Math.round(srcH * scale);
                ctx.drawImage(source, 0, 0, work.width, work.height);
                const results = await readBarcodes(
                  ctx.getImageData(0, 0, work.width, work.height),
                  {
                    formats: ["PDF417"],
                    tryHarder: true,
                    tryRotate: true,
                    tryInvert: true,
                    tryDownscale: true,
                    maxNumberOfSymbols: 1,
                  },
                );
                text = results[0]?.text;
                if (text !== undefined) break;
              }
            }
          }

          const parsed = text ? parseAamvaName(text) : null;
          if (parsed) {
            stopCamera();
            setName(titleCase(parsed));
            setStep("confirm");
            return;
          }
          setStillFailed(true);
        } finally {
          cleanup();
        }
      } catch {
        setStillFailed(true);
      } finally {
        stillBusyRef.current = false;
        setStillBusy(false);
        if (stillInputRef.current) stillInputRef.current.value = "";
      }
    },
    [stopCamera],
  );

  // Barcode scan loop (step === "scan") — only once the server has confirmed
  // the session token is still valid.
  useEffect(() => {
    if (step !== "scan" || manualEntry || sessionValid !== true) return;
    let cancelled = false;
    setScannerError(false);

    (async () => {
      const ok = await startCamera();
      if (!ok || cancelled) return;

      // Prefer the browser's native BarcodeDetector when it supports PDF417
      // (Chrome/Android — hardware-backed and far better at dense barcodes
      // than a WASM decoder). Falls back to zxing-wasm elsewhere (iOS).
      type NativeDetector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
      let nativeDetector: NativeDetector | null = null;
      try {
        const BD = (
          window as unknown as {
            BarcodeDetector?: {
              new (opts: { formats: string[] }): NativeDetector;
              getSupportedFormats?: () => Promise<string[]>;
            };
          }
        ).BarcodeDetector;
        if (BD?.getSupportedFormats) {
          const fmts = await BD.getSupportedFormats();
          if (fmts.includes("pdf417")) nativeDetector = new BD({ formats: ["pdf417"] });
        }
      } catch {
        nativeDetector = null;
      }

      const readBarcodes = await loadZxing();
      if (!nativeDetector && !readBarcodes) {
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
      let frameNo = 0;
      let consecutiveDecodeErrors = 0;
      // Consecutive native-detector frames with no result. Some devices
      // nominally support pdf417 but never actually detect a dense license
      // barcode — after ~2s of misses, start interleaving zxing-wasm attempts
      // instead of trusting the native detector forever.
      let nativeMisses = 0;

      const tick = async () => {
        if (cancelled || !scanningRef.current) return;
        // Idle while a still photo is being decoded (never run both decoders
        // at once) or while the page is backgrounded (native camera app open).
        if (stillBusyRef.current || document.hidden) {
          setTimeout(tick, 250);
          return;
        }
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.videoWidth > 0) {
          try {
            let text: string | undefined;
            if (nativeDetector) {
              try {
                // Feed the native detector the RAW full-resolution video frame —
                // it is hardware-backed and handles 4K fine. Downscaling first
                // (what we used to do) destroys exactly the pixel density a
                // dense PDF417 needs.
                const detections = await nativeDetector.detect(video);
                text = detections[0]?.rawValue;
                nativeMisses = text === undefined ? nativeMisses + 1 : 0;
              } catch {
                // Native detector broken on this device — fall back to WASM.
                nativeDetector = null;
                if (!readBarcodes) throw new Error("no decoder");
              }
            }
            // zxing runs when there is no (working) native detector, or as an
            // interleaved second opinion (every other frame) once the native
            // detector has gone ~2s without detecting anything.
            const wasmTurn =
              !nativeDetector || (nativeMisses >= 8 && nativeMisses % 2 === 0);
            if (text === undefined && readBarcodes && wasmTurn) {
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              const useCrop = frameNo % 2 === 0;
              frameNo += 1;
              // Center crop ≈ the on-screen guide box (80% × 60% of the frame).
              const sw = useCrop ? Math.round(vw * 0.8) : vw;
              const sh = useCrop ? Math.round(vh * 0.6) : vh;
              const sx = Math.round((vw - sw) / 2);
              const sy = Math.round((vh - sh) / 2);
              // Keep full detail on the crop pass (a 3072×1296 RGBA buffer is
              // ~16MB — fine) — PDF417 modules are tiny and downscaling is the
              // main reason dense barcodes fail to decode.
              const longEdgeCap = useCrop ? 3200 : 1920;
              const scale = Math.min(1, longEdgeCap / Math.max(sw, sh));
              canvas.width = Math.round(sw * scale);
              canvas.height = Math.round(sh * scale);
              const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const results = await readBarcodes(imageData, {
                formats: ["PDF417"],
                tryHarder: true,
                tryRotate: true,
                tryInvert: true,
                tryDownscale: true,
                maxNumberOfSymbols: 1,
              });
              text = results[0]?.text;
            }
            consecutiveDecodeErrors = 0;
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
  }, [step, manualEntry, sessionValid, startCamera, stopCamera]);

  // Live guest photo (step === "photo")
  useEffect(() => {
    if (step !== "photo" || photo || sessionValid !== true) return;
    let cancelled = false;
    (async () => {
      const ok = await startCamera();
      if (!ok || cancelled) return;
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [step, photo, sessionValid, startCamera, stopCamera]);

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
        {sessionValid === false && step !== "done" ? (
          <div className="flex flex-col items-center gap-3 text-center" data-testid="text-session-dead">
            <XCircle className="w-12 h-12 text-destructive" />
            <h2 className="text-lg font-semibold">This scan link is no longer valid</h2>
            <p className="text-sm text-muted-foreground">
              The security desk closed or restarted the scan. Ask the desk to open the Scan ID
              dialog again and scan the new QR code.
            </p>
          </div>
        ) : sessionValid === null && step === "scan" ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground" data-testid="text-session-checking">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Checking scan link…</p>
          </div>
        ) : (
          <>
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
                  {zoomMax > 1 && !cameraError && !scannerError && (
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
                      {[1, 2, ...(zoomMax >= 3 ? [3] : [])].map((z) => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => void applyZoom(z)}
                          data-testid={`button-zoom-${z}`}
                          className={`px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm transition-colors ${
                            zoomLevel === z
                              ? "bg-primary text-primary-foreground"
                              : "bg-background/60 text-foreground"
                          }`}
                        >
                          {z}×
                        </button>
                      ))}
                    </div>
                  )}
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
                      Fill the frame with the barcode, hold steady, and avoid glare.
                      {zoomMax > 1
                        ? " If it looks blurry up close, tap 2× and hold the license a bit farther away."
                        : " Move slightly closer or farther until it focuses."}
                    </p>
                    {camRes && (
                      <p className="text-[10px] text-muted-foreground/60" data-testid="text-cam-res">
                        Camera {camRes}
                      </p>
                    )}
                  </div>
                )}
                {(stillOffer || cameraError || scannerError || insecureContext) && (
                  <div className="w-full space-y-2">
                    <input
                      ref={stillInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      data-testid="input-still-photo"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void decodeStillPhoto(f);
                      }}
                    />
                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={stillBusy}
                      onClick={() => stillInputRef.current?.click()}
                      data-testid="button-still-photo"
                    >
                      {stillBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Reading photo…
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4 mr-1" /> Having trouble? Take a photo of the barcode
                        </>
                      )}
                    </Button>
                    {stillFailed && !stillBusy && (
                      <p className="text-xs text-destructive text-center" data-testid="text-still-failed">
                        Couldn't read the barcode from that photo. Fill the frame with the barcode,
                        make sure it's in focus, avoid glare — and try again.
                      </p>
                    )}
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
          </>
        )}
      </main>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
