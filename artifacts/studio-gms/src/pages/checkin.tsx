import { useState, useRef, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useCreateGuest, useCheckWatchlist, useUploadPhoto } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Camera, CameraOff, RefreshCw, UserPlus, XCircle } from "lucide-react";

const SITES = ["Dallas/The Plex", "Tustin", "Nashville"];
const PURPOSES = [
  "Production meeting",
  "Vendor demo",
  "Studio tour",
  "Contract discussion",
  "Equipment service",
  "Executive walkthrough",
  "Other",
];

interface BadgePreview {
  badgeId: string;
  name: string;
  company: string;
  host: string;
  site: string;
  checkinAt: string;
}

export default function CheckIn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [form, setForm] = useState({
    name: "", company: "", phone: "", email: "",
    hostName: "", purposeOfVisit: "", site: "",
    expectedDeparture: "",
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [badge, setBadge] = useState<BadgePreview | null>(null);
  const [watchlistWarning, setWatchlistWarning] = useState<string | null>(null);
  const [nameCheckTimeout, setNameCheckTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const { mutateAsync: createGuest, isPending } = useCreateGuest();
  const { mutateAsync: uploadPhoto, isPending: uploadingPhoto } = useUploadPhoto();
  const { refetch: checkWatchlist } = useCheckWatchlist(
    { name: form.name },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: false, retry: false } as any }
  );

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
    setPhoto(dataUrl);
    stopCamera();
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleNameChange = (value: string) => {
    setForm((f) => ({ ...f, name: value }));
    setWatchlistWarning(null);
    if (nameCheckTimeout) clearTimeout(nameCheckTimeout);
    if (value.length >= 3) {
      const t = setTimeout(async () => {
        try {
          const result = await checkWatchlist();
          if (result.data?.matched) {
            const entries = result.data.entries ?? [];
            const blocked = entries.filter((e) => e.action === "block");
            const flagged = entries.filter((e) => e.action === "flag");
            if (blocked.length > 0) {
              setWatchlistWarning(`⛔ BLOCKED: ${blocked[0].reason}`);
            } else if (flagged.length > 0) {
              setWatchlistWarning(`⚠️ FLAGGED: ${flagged[0].reason}`);
            }
          }
        } catch { /* silent */ }
      }, 600);
      setNameCheckTimeout(t);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.company || !form.hostName || !form.site) {
      toast({ title: "Missing required fields", variant: "destructive" });
      return;
    }

    let finalPhotoUrl = photoUrl;
    if (photo && !photoUrl) {
      try {
        const base64 = photo.split(",")[1];
        const result = await uploadPhoto({ data: { imageData: base64 } });
        finalPhotoUrl = result.photoUrl;
        setPhotoUrl(result.photoUrl);
      } catch {
        toast({ title: "Photo upload failed", description: "Continuing without photo.", variant: "destructive" });
      }
    }

    try {
      const guest = await createGuest({
        data: {
          name: form.name,
          company: form.company,
          phone: form.phone || undefined,
          email: form.email || undefined,
          hostName: form.hostName,
          purposeOfVisit: form.purposeOfVisit || "Other",
          site: form.site,
          expectedDeparture: form.expectedDeparture || undefined,
          photoUrl: finalPhotoUrl ?? undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      setBadge({
        badgeId: guest.badgeId,
        name: guest.name,
        company: guest.company,
        host: guest.hostName,
        site: guest.site,
        checkinAt: guest.checkinAt,
      });
      setForm({ name: "", company: "", phone: "", email: "", hostName: "", purposeOfVisit: "", site: "", expectedDeparture: "" });
      setPhoto(null);
      setPhotoUrl(null);
      setWatchlistWarning(null);
      toast({ title: "Guest checked in", description: `Badge ${guest.badgeId} issued.` });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { message?: string } }; message?: string };
      const msg = apiErr?.response?.data?.message || apiErr?.message || "Check-in failed";
      toast({ title: "Entry denied", description: msg, variant: "destructive" });
    }
  };

  const handlePrint = () => window.print();

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Guest Check-In</h2>
          <p className="text-muted-foreground">Register a new visitor and issue a badge.</p>
        </div>

        {badge ? (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-md p-6 max-w-md mx-auto print:border-gray-800 print:bg-white print:text-black">
              <div className="text-center mb-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground print:text-gray-500 mb-1">VISITOR BADGE</div>
                <div className="text-4xl font-mono font-bold text-primary print:text-blue-700">{badge.badgeId}</div>
              </div>
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-semibold">{badge.name}</span></div>
                <div><span className="text-muted-foreground">Company:</span> {badge.company}</div>
                <div><span className="text-muted-foreground">Host:</span> {badge.host}</div>
                <div><span className="text-muted-foreground">Site:</span> {badge.site}</div>
                <div><span className="text-muted-foreground">Check-in:</span> {new Date(badge.checkinAt).toLocaleString()}</div>
              </div>
            </div>
            <div className="flex gap-3 justify-center print:hidden">
              <Button onClick={handlePrint} variant="outline">Print Badge</Button>
              <Button onClick={() => setBadge(null)}>
                <UserPlus className="w-4 h-4 mr-2" /> Check In Another
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4 bg-card border border-border rounded-md p-6">
              {watchlistWarning && (
                <div className={`flex items-start gap-3 p-3 rounded-md border text-sm ${watchlistWarning.startsWith("⛔") ? "bg-destructive/10 border-destructive/40 text-destructive" : "bg-yellow-500/10 border-yellow-500/40 text-yellow-500"}`}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{watchlistWarning}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input id="name" value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="First Last" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="company">Company *</Label>
                  <Input id="company" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Organization" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="555-000-0000" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="guest@example.com" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="host">Host Name *</Label>
                  <Input id="host" value={form.hostName} onChange={(e) => setForm((f) => ({ ...f, hostName: e.target.value }))} placeholder="Employee name" required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="site">Site *</Label>
                  <Select value={form.site} onValueChange={(v) => setForm((f) => ({ ...f, site: v }))}>
                    <SelectTrigger id="site" className="mt-1">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="purpose">Purpose of Visit</Label>
                  <Select value={form.purposeOfVisit} onValueChange={(v) => setForm((f) => ({ ...f, purposeOfVisit: v }))}>
                    <SelectTrigger id="purpose" className="mt-1">
                      <SelectValue placeholder="Select purpose" />
                    </SelectTrigger>
                    <SelectContent>
                      {PURPOSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="departure">Expected Departure</Label>
                  <Input id="departure" type="datetime-local" value={form.expectedDeparture} onChange={(e) => setForm((f) => ({ ...f, expectedDeparture: e.target.value }))} className="mt-1" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={isPending || uploadingPhoto} className="flex-1">
                  <UserPlus className="w-4 h-4 mr-2" />
                  {isPending ? "Checking in..." : "Check In Guest"}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-card border border-border rounded-md p-4">
                <h3 className="text-sm font-medium mb-3">Photo Capture</h3>
                <div className="aspect-square bg-muted rounded-md overflow-hidden mb-3 flex items-center justify-center relative">
                  {photo ? (
                    <img src={photo} alt="Captured" className="w-full h-full object-cover" />
                  ) : (
                    <video ref={videoRef} autoPlay muted className={`w-full h-full object-cover ${cameraOn ? "" : "hidden"}`} />
                  )}
                  {!photo && !cameraOn && (
                    <div className="text-center text-muted-foreground p-4">
                      <CameraOff className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-xs">No photo</p>
                    </div>
                  )}
                  {photo && (
                    <button type="button" onClick={() => setPhoto(null)} className="absolute top-2 right-2 bg-background/80 rounded-full p-1 hover:bg-background transition-colors">
                      <XCircle className="w-4 h-4 text-destructive" />
                    </button>
                  )}
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <div className="flex gap-2">
                  {!cameraOn && !photo && (
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
                  {photo && (
                    <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => { setPhoto(null); setPhotoUrl(null); startCamera(); }}>
                      <RefreshCw className="w-4 h-4 mr-1" /> Retake
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}
