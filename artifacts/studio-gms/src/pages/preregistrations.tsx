import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListPreregistrations,
  useCreatePreregistration,
  useDeletePreregistration,
  useConvertPreregistration,
  useUploadPhoto,
  useListKnownGuests,
  type Preregistration,
  type ListPreregistrationsRange,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PURPOSES } from "@/lib/purposes";
import { useToast } from "@/hooks/use-toast";
import { useListStudios } from "@workspace/api-client-react";
import { SITE_NAME } from "@/lib/site";
import { PhotoCapture } from "@/components/photo-capture";
import { VisitorBadge, type VisitorBadgeData } from "@/components/visitor-badge";
import { printBadge } from "@/lib/print-badge";
import { BadgeSizeControl } from "@/components/badge-size-control";
import { AlertTriangle, CalendarClock, LogIn, Plus, Printer, Trash2, UserPlus } from "lucide-react";
import { format } from "date-fns";

type Preg = Preregistration;

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Preregistrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [range, setRange] = useState<ListPreregistrationsRange>("day");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Convert-to-check-in dialog (photo capture + badge)
  const [convertTarget, setConvertTarget] = useState<Preg | null>(null);
  const [convertPhoto, setConvertPhoto] = useState<string | null>(null);
  // Known-guest photo prefilled for returning visitors (cleared on retake/clear).
  const [convertPhotoUrl, setConvertPhotoUrl] = useState<string | null>(null);
  const [convertPhotoDismissed, setConvertPhotoDismissed] = useState(false);
  const [convertBadge, setConvertBadge] = useState<VisitorBadgeData | null>(null);
  const [convertPending, setConvertPending] = useState(false);

  // Look up the guest in the known-guests directory while the convert dialog
  // is open, so a returning visitor's photo carries over to this check-in.
  const { data: knownMatches } = useListKnownGuests(
    { q: convertTarget?.guestName ?? "" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: convertTarget !== null && (convertTarget?.guestName.trim().length ?? 0) >= 2 } as any }
  );

  useEffect(() => {
    if (!convertTarget || convertPhoto || convertPhotoDismissed || convertPhotoUrl) return;
    const match = knownMatches?.items?.find(
      (kg) => kg.name.trim().toLowerCase() === convertTarget.guestName.trim().toLowerCase()
    );
    if (match?.photoUrl) setConvertPhotoUrl(match.photoUrl);
  }, [knownMatches, convertTarget, convertPhoto, convertPhotoDismissed, convertPhotoUrl]);

  const [form, setForm] = useState({
    guestName: "", company: "", phone: "", email: "",
    hostName: "", purposeOfVisit: "",
    expectedArrival: "", expectedDeparture: "",
  });
  const [studios, setStudios] = useState<string[]>([]);
  const { data: studioList } = useListStudios();

  const toggleStudio = (name: string, checked: boolean) => {
    setStudios((prev) => (checked ? [...prev, name] : prev.filter((s) => s !== name)));
  };

  const { data: pregs, isLoading } = useListPreregistrations({ date, range });
  const { mutateAsync: createPreg, isPending: creating } = useCreatePreregistration();
  const { mutateAsync: deletePreg } = useDeletePreregistration();
  const { mutateAsync: convertPreg } = useConvertPreregistration();
  const { mutateAsync: uploadPhoto } = useUploadPhoto();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.guestName || !form.hostName || !form.expectedArrival) {
      toast({ title: "Missing required fields", variant: "destructive" });
      return;
    }
    try {
      await createPreg({
        data: {
          guestName: form.guestName,
          company: form.company || "",
          phone: form.phone || undefined,
          email: form.email || undefined,
          hostName: form.hostName,
          purposeOfVisit: form.purposeOfVisit || undefined,
          site: SITE_NAME,
          expectedArrival: form.expectedArrival,
          expectedDeparture: form.expectedDeparture || undefined,
          studios,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/preregistrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "Pre-registration created" });
      setOpen(false);
      setForm({ guestName: "", company: "", phone: "", email: "", hostName: "", purposeOfVisit: "", expectedArrival: "", expectedDeparture: "" });
      setStudios([]);
    } catch {
      toast({ title: "Failed to create pre-registration", variant: "destructive" });
    }
  };

  const openConvert = (p: Preg) => {
    setConvertTarget(p);
    setConvertPhoto(null);
    setConvertPhotoUrl(null);
    setConvertPhotoDismissed(false);
    setConvertBadge(null);
  };

  const closeConvert = () => {
    setConvertTarget(null);
    setConvertPhoto(null);
    setConvertPhotoUrl(null);
    setConvertPhotoDismissed(false);
    setConvertBadge(null);
    setConvertPending(false);
  };

  const handleConvert = async () => {
    if (!convertTarget) return;
    setConvertPending(true);
    try {
      let photoUrl: string | undefined = convertPhotoUrl ?? undefined;
      if (convertPhoto) {
        try {
          const base64 = convertPhoto.split(",")[1];
          const result = await uploadPhoto({ data: { imageData: base64 } });
          photoUrl = result.photoUrl;
        } catch {
          toast({ title: "Photo upload failed", description: "Continuing without photo.", variant: "destructive" });
        }
      }
      const guest = await convertPreg({ id: convertTarget.id, data: { photoUrl } });
      queryClient.invalidateQueries({ queryKey: ["/api/preregistrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      setConvertBadge({
        badgeId: guest.badgeId,
        name: guest.name,
        company: guest.company,
        host: guest.hostName,
        site: guest.site,
        studios: guest.studios ?? [],
        purpose: guest.purposeOfVisit,
        checkinAt: guest.checkinAt,
        expectedDeparture: guest.expectedDeparture ?? null,
        photo: convertPhoto ?? guest.photoUrl ?? null,
      });
      toast({ title: "Guest checked in", description: `Badge ${guest.badgeId} issued.` });
    } catch {
      toast({ title: "Conversion failed", variant: "destructive" });
    } finally {
      setConvertPending(false);
    }
  };

  const handlePrint = () => printBadge();

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await deletePreg({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/preregistrations"] });
      toast({ title: "Pre-registration removed" });
    } catch {
      toast({ title: "Deletion failed", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const pending = pregs?.filter((p) => p.status === "pending") ?? [];
  const converted = pregs?.filter((p) => p.status === "converted") ?? [];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Pre-Registrations</h2>
            <p className="text-muted-foreground">Expected guests for a given day or week.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Add Pre-Registration</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Pre-Registration</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label>Guest Name *</Label>
                    <Input className="mt-1" value={form.guestName} onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))} placeholder="Full name" required />
                  </div>
                  <div>
                    <Label>Company</Label>
                    <Input className="mt-1" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Organization" />
                  </div>
                  <div>
                    <Label>Host Name *</Label>
                    <Input className="mt-1" value={form.hostName} onChange={(e) => setForm((f) => ({ ...f, hostName: e.target.value }))} placeholder="Employee name" required />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input className="mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input className="mt-1" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Site</Label>
                    <div className="mt-1 flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                      {SITE_NAME}
                    </div>
                  </div>
                  <div>
                    <Label>Purpose</Label>
                    <Select value={form.purposeOfVisit} onValueChange={(v) => setForm((f) => ({ ...f, purposeOfVisit: v }))}>
                      <SelectTrigger className="mt-1" data-testid="select-purpose">
                        <SelectValue placeholder="Select purpose" />
                      </SelectTrigger>
                      <SelectContent>
                        {PURPOSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Expected Arrival *</Label>
                    <Input className="mt-1" type="datetime-local" value={form.expectedArrival} onChange={(e) => setForm((f) => ({ ...f, expectedArrival: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>Expected Departure</Label>
                    <Input className="mt-1" type="datetime-local" value={form.expectedDeparture} onChange={(e) => setForm((f) => ({ ...f, expectedDeparture: e.target.value }))} />
                  </div>
                  {(studioList?.length ?? 0) > 0 && (
                    <div className="sm:col-span-2">
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
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={creating}>{creating ? "Saving..." : "Save"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Label className="shrink-0">{range === "week" ? "Week starting" : "Date"}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {(["day", "week"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                data-testid={`button-prereg-range-${r}`}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  range === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-border rounded-md">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <h3 className="font-medium">Expected ({pending.length})</h3>
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : pending.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {range === "week"
                  ? "No pending pre-registrations for this week."
                  : "No pending pre-registrations for this date."}
              </div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Company</th>
                    <th className="px-4 py-3 text-left font-medium">Host</th>
                    <th className="px-4 py-3 text-left font-medium">Studios</th>
                    <th className="px-4 py-3 text-left font-medium">Arrival</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pending.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        {p.guestName}
                        {p.approvalStatus === "pending" && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600" data-testid={`pill-pending-${p.id}`}>
                            AWAITING APPROVAL{p.approvalStage === 2 ? " (2ND)" : ""}
                          </span>
                        )}
                        {p.approvalStatus === "denied" && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/15 text-destructive" data-testid={`pill-denied-${p.id}`}>
                            DENIED
                          </span>
                        )}
                        {p.lateRegistration && p.approvalStatus !== "denied" && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600" title="Registered less than 4 hours before arrival">
                            <AlertTriangle className="w-2.5 h-2.5" /> LATE REG
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.company}</td>
                      <td className="px-4 py-3">{p.hostName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.studios?.length ? p.studios.join(", ") : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {format(new Date(p.expectedArrival), range === "week" ? "EEE MMM d, HH:mm" : "HH:mm")}
                      </td>
                      <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => openConvert(p)}
                          disabled={p.approvalStatus === "pending" || p.approvalStatus === "denied"}
                          title={
                            p.approvalStatus === "pending"
                              ? "Awaiting approval — cannot check in yet"
                              : p.approvalStatus === "denied"
                                ? "Denied — cannot check in"
                                : undefined
                          }
                        >
                          <LogIn className="w-3 h-3 mr-1" />
                          Check In
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)} disabled={deleting === p.id}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          {converted.length > 0 && (
            <div className="bg-card border border-border rounded-md opacity-60">
              <div className="p-4 border-b border-border">
                <h3 className="font-medium text-muted-foreground">Converted ({converted.length})</h3>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {converted.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium line-through text-muted-foreground">{p.guestName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.company}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.hostName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.studios?.length ? p.studios.join(", ") : "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">Checked In</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={convertTarget !== null} onOpenChange={(o) => { if (!o) closeConvert(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{convertBadge ? "Badge Issued" : "Check In Guest"}</DialogTitle>
          </DialogHeader>

          {convertBadge ? (
            <div className="space-y-6">
              <VisitorBadge data={convertBadge} />
              <div className="flex flex-col items-center gap-3 print:hidden">
                <div className="flex gap-3 justify-center">
                  <Button onClick={handlePrint} variant="outline">
                    <Printer className="w-4 h-4 mr-2" /> Print Badge
                  </Button>
                  <Button onClick={closeConvert}>Done</Button>
                </div>
                <BadgeSizeControl />
              </div>
            </div>
          ) : convertTarget ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="font-semibold">{convertTarget.guestName}</div>
                <div className="text-muted-foreground">{convertTarget.company || "—"}</div>
                <div className="mt-1 text-xs text-muted-foreground">Host: {convertTarget.hostName}</div>
                {convertTarget.studios?.length ? (
                  <div className="text-xs text-muted-foreground">Studios: {convertTarget.studios.join(", ")}</div>
                ) : null}
              </div>
              <div>
                <Label className="mb-2 block">Photo (optional)</Label>
                <PhotoCapture
                  photo={convertPhoto}
                  photoUrl={convertPhotoUrl}
                  onChange={(p) => {
                    setConvertPhoto(p);
                    if (convertPhotoUrl) {
                      setConvertPhotoUrl(null);
                      setConvertPhotoDismissed(true);
                    }
                  }}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={closeConvert} disabled={convertPending}>Cancel</Button>
                <Button onClick={handleConvert} disabled={convertPending}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  {convertPending ? "Checking in..." : "Check In & Issue Badge"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
