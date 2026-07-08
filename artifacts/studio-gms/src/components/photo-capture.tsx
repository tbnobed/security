import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Camera, CameraOff, RefreshCw, XCircle } from "lucide-react";

interface PhotoCaptureProps {
  /** Current captured photo as a data URL, or null. */
  photo: string | null;
  /**
   * Already-uploaded photo URL to display when no local capture exists
   * (e.g. transferred from the phone ID-scan or a known-guest prefill).
   * Cleared via onChange(null) / retake like a local capture.
   */
  photoUrl?: string | null;
  /** Called with the captured data URL, or null when cleared. */
  onChange: (photo: string | null) => void;
}

/**
 * Reusable webcam capture panel. Emits a JPEG data URL via onChange.
 * Used by both the manual check-in form and the pre-registration convert flow.
 */
export function PhotoCapture({ photo, photoUrl, onChange }: PhotoCaptureProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOn(false);
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch {
      toast({ title: "Camera unavailable", description: "Could not access webcam.", variant: "destructive" });
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.8);
    onChange(dataUrl);
    stopCamera();
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  // A local capture wins; otherwise show the already-uploaded photo (but not
  // while the camera is live for a retake).
  const displayed = photo ?? (cameraOn ? null : (photoUrl ?? null));

  return (
    <div>
      <div className="aspect-square bg-muted rounded-md overflow-hidden mb-3 flex items-center justify-center relative">
        {displayed ? (
          <img src={displayed} alt="Captured" className="w-full h-full object-cover" data-testid="img-photo-preview" />
        ) : (
          <video ref={videoRef} autoPlay muted className={`w-full h-full object-cover ${cameraOn ? "" : "hidden"}`} />
        )}
        {!displayed && !cameraOn && (
          <div className="text-center text-muted-foreground p-4">
            <CameraOff className="w-8 h-8 mx-auto mb-2" />
            <p className="text-xs">No photo</p>
          </div>
        )}
        {displayed && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 bg-background/80 rounded-full p-1 hover:bg-background transition-colors"
          >
            <XCircle className="w-4 h-4 text-destructive" />
          </button>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex gap-2">
        {!cameraOn && !displayed && (
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={startCamera}>
            <Camera className="w-4 h-4 mr-1" /> Start Camera
          </Button>
        )}
        {cameraOn && (
          <>
            <Button type="button" size="sm" className="flex-1" onClick={capturePhoto}>
              <Camera className="w-4 h-4 mr-1" /> Capture
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={stopCamera}>
              <XCircle className="w-4 h-4" />
            </Button>
          </>
        )}
        {displayed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              onChange(null);
              startCamera();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-1" /> Retake
          </Button>
        )}
      </div>
    </div>
  );
}
