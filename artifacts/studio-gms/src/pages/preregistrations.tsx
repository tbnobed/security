import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListPreregistrations,
  useCreatePreregistration,
  useDeletePreregistration,
  useConvertPreregistration,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, LogIn, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

const SITES = ["Dallas/The Plex", "Tustin", "Nashville"];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Preregistrations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [open, setOpen] = useState(false);
  const [converting, setConverting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [form, setForm] = useState({
    guestName: "", company: "", phone: "", email: "",
    hostName: "", purposeOfVisit: "", site: "",
    expectedArrival: "", expectedDeparture: "",
  });

  const { data: pregs, isLoading } = useListPreregistrations({ date });
  const { mutateAsync: createPreg, isPending: creating } = useCreatePreregistration();
  const { mutateAsync: deletePreg } = useDeletePreregistration();
  const { mutateAsync: convertPreg } = useConvertPreregistration();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.guestName || !form.hostName || !form.site || !form.expectedArrival) {
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
          site: form.site || "",
          expectedArrival: form.expectedArrival,
          expectedDeparture: form.expectedDeparture || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/preregistrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "Pre-registration created" });
      setOpen(false);
      setForm({ guestName: "", company: "", phone: "", email: "", hostName: "", purposeOfVisit: "", site: "", expectedArrival: "", expectedDeparture: "" });
    } catch {
      toast({ title: "Failed to create pre-registration", variant: "destructive" });
    }
  };

  const handleConvert = async (id: number, name: string) => {
    setConverting(id);
    try {
      await convertPreg({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/preregistrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "Guest checked in", description: `${name} converted from pre-registration.` });
    } catch {
      toast({ title: "Conversion failed", variant: "destructive" });
    } finally {
      setConverting(null);
    }
  };

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
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Pre-Registrations</h2>
            <p className="text-muted-foreground">Expected guests for a given day.</p>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
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
                    <Label>Site *</Label>
                    <Select value={form.site} onValueChange={(v) => setForm((f) => ({ ...f, site: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select site" /></SelectTrigger>
                      <SelectContent>{SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Purpose</Label>
                    <Input className="mt-1" value={form.purposeOfVisit} onChange={(e) => setForm((f) => ({ ...f, purposeOfVisit: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div>
                    <Label>Expected Arrival *</Label>
                    <Input className="mt-1" type="datetime-local" value={form.expectedArrival} onChange={(e) => setForm((f) => ({ ...f, expectedArrival: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>Expected Departure</Label>
                    <Input className="mt-1" type="datetime-local" value={form.expectedDeparture} onChange={(e) => setForm((f) => ({ ...f, expectedDeparture: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={creating}>{creating ? "Saving..." : "Save"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <Label className="shrink-0">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
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
              <div className="p-8 text-center text-muted-foreground">No pending pre-registrations for this date.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Company</th>
                    <th className="px-4 py-3 text-left font-medium">Host</th>
                    <th className="px-4 py-3 text-left font-medium">Site</th>
                    <th className="px-4 py-3 text-left font-medium">Arrival</th>
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pending.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{p.guestName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.company}</td>
                      <td className="px-4 py-3">{p.hostName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.site}</td>
                      <td className="px-4 py-3 text-muted-foreground">{format(new Date(p.expectedArrival), "HH:mm")}</td>
                      <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                        <Button size="sm" onClick={() => handleConvert(p.id, p.guestName)} disabled={converting === p.id}>
                          <LogIn className="w-3 h-3 mr-1" />
                          {converting === p.id ? "..." : "Check In"}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)} disabled={deleting === p.id}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {converted.length > 0 && (
            <div className="bg-card border border-border rounded-md opacity-60">
              <div className="p-4 border-b border-border">
                <h3 className="font-medium text-muted-foreground">Converted ({converted.length})</h3>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {converted.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-medium line-through text-muted-foreground">{p.guestName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.company}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.hostName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.site}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">Checked In</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
