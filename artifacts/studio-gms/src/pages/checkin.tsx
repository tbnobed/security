import { useState } from "react";
import { Layout } from "@/components/layout";
import { useCreateGuest, useCheckWatchlist, useUploadPhoto } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useListStudios } from "@workspace/api-client-react";
import { SITE_NAME } from "@/lib/site";
import { PhotoCapture } from "@/components/photo-capture";
import { VisitorBadge, type VisitorBadgeData } from "@/components/visitor-badge";
import { printBadge } from "@/lib/print-badge";
import { AlertTriangle, Printer, UserPlus } from "lucide-react";

const PURPOSES = [
  "Production meeting",
  "Vendor demo",
  "Studio tour",
  "Contract discussion",
  "Equipment service",
  "Executive walkthrough",
  "Other",
];

export default function CheckIn() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: "", company: "", phone: "", email: "",
    hostName: "", purposeOfVisit: "",
    expectedDeparture: "",
  });
  const [studios, setStudios] = useState<string[]>([]);
  const { data: studioList } = useListStudios();
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [badge, setBadge] = useState<VisitorBadgeData | null>(null);
  const [watchlistWarning, setWatchlistWarning] = useState<string | null>(null);
  const [nameCheckTimeout, setNameCheckTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const { mutateAsync: createGuest, isPending } = useCreateGuest();
  const { mutateAsync: uploadPhoto, isPending: uploadingPhoto } = useUploadPhoto();
  const { refetch: checkWatchlist } = useCheckWatchlist(
    { name: form.name },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: false, retry: false } as any }
  );

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

  const toggleStudio = (name: string, checked: boolean) => {
    setStudios((prev) => (checked ? [...prev, name] : prev.filter((s) => s !== name)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.company || !form.hostName) {
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
      const purpose = form.purposeOfVisit || "Other";
      const guest = await createGuest({
        data: {
          name: form.name,
          company: form.company,
          phone: form.phone || undefined,
          email: form.email || undefined,
          hostName: form.hostName,
          purposeOfVisit: purpose,
          site: SITE_NAME,
          studios,
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
        studios: guest.studios ?? [],
        purpose: guest.purposeOfVisit,
        checkinAt: guest.checkinAt,
        expectedDeparture: guest.expectedDeparture ?? null,
        photo: photo ?? finalPhotoUrl ?? null,
      });
      setForm({ name: "", company: "", phone: "", email: "", hostName: "", purposeOfVisit: "", expectedDeparture: "" });
      setStudios([]);
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

  const handlePrint = () => printBadge();

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Guest Check-In</h2>
          <p className="text-muted-foreground">Register a new visitor and issue a badge.</p>
        </div>

        {badge ? (
          <div className="space-y-6">
            <VisitorBadge data={badge} />
            <div className="flex gap-3 justify-center print:hidden">
              <Button onClick={handlePrint} variant="outline">
                <Printer className="w-4 h-4 mr-2" /> Print Badge
              </Button>
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
                  <Label htmlFor="site">Site</Label>
                  <div id="site" className="mt-1 flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                    {SITE_NAME}
                  </div>
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
                {(studioList?.length ?? 0) > 0 && (
                  <div className="col-span-2">
                    <Label>Studios</Label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {studioList?.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-muted/50">
                          <Checkbox checked={studios.includes(s.name)} onCheckedChange={(c) => toggleStudio(s.name, c === true)} />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
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
                <PhotoCapture photo={photo} onChange={(p) => { setPhoto(p); setPhotoUrl(null); }} />
              </div>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}
