import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListWatchlist, useCreateWatchlistEntry, useDeleteWatchlistEntry } from "@workspace/api-client-react";
import type { WatchlistEntry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Plus, Trash2, XCircle } from "lucide-react";
import { format } from "date-fns";

export default function Watchlist() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", company: "", reason: "", action: "flag" as "flag" | "block" });

  const { data: entries, isLoading } = useListWatchlist();
  const { mutateAsync: createEntry, isPending: creating } = useCreateWatchlistEntry();
  const { mutateAsync: deleteEntry } = useDeleteWatchlistEntry();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.reason) {
      toast({ title: "Name and reason are required", variant: "destructive" });
      return;
    }
    try {
      await createEntry({
        data: {
          name: form.name,
          company: form.company || undefined,
          reason: form.reason,
          action: form.action,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: "Watchlist entry added", description: `${form.name} — ${form.action}` });
      setOpen(false);
      setForm({ name: "", company: "", reason: "", action: "flag" });
    } catch {
      toast({ title: "Failed to add entry", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number, name: string) => {
    setDeleting(id);
    try {
      await deleteEntry({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: `${name} removed from watchlist` });
    } catch {
      toast({ title: "Deletion failed", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const blocked = entries?.filter((e) => e.action === "block") ?? [];
  const flagged = entries?.filter((e) => e.action === "flag") ?? [];

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Watchlist</h2>
            <p className="text-muted-foreground">Manage blocked and flagged individuals.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive"><Plus className="w-4 h-4 mr-2" /> Add Entry</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Watchlist Entry</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div>
                  <Label>Full Name *</Label>
                  <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="First Last" required />
                </div>
                <div>
                  <Label>Company</Label>
                  <Input className="mt-1" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Optional" />
                </div>
                <div>
                  <Label>Reason *</Label>
                  <Input className="mt-1" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Reason for flagging/blocking" required />
                </div>
                <div>
                  <Label>Action *</Label>
                  <Select value={form.action} onValueChange={(v: "flag" | "block") => setForm((f) => ({ ...f, action: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flag">Flag (warn security, allow entry)</SelectItem>
                      <SelectItem value="block">Block (deny entry)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" variant="destructive" disabled={creating}>{creating ? "Saving..." : "Add to Watchlist"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-6">
          <WatchlistSection
            title="Blocked"
            icon={<XCircle className="w-4 h-4 text-destructive" />}
            entries={blocked}
            isLoading={isLoading}
            onDelete={handleDelete}
            deleting={deleting}
            emptyMsg="No blocked individuals."
          />
          <WatchlistSection
            title="Flagged"
            icon={<AlertTriangle className="w-4 h-4 text-yellow-500" />}
            entries={flagged}
            isLoading={isLoading}
            onDelete={handleDelete}
            deleting={deleting}
            emptyMsg="No flagged individuals."
          />
        </div>
      </div>
    </Layout>
  );
}

interface WatchlistSectionProps {
  title: string;
  icon: React.ReactNode;
  entries: WatchlistEntry[];
  isLoading: boolean;
  onDelete: (id: number, name: string) => void;
  deleting: number | null;
  emptyMsg: string;
}

function WatchlistSection({ title, icon, entries, isLoading, onDelete, deleting, emptyMsg }: WatchlistSectionProps) {
  return (
    <div className="bg-card border border-border rounded-md">
      <div className="p-4 border-b border-border flex items-center gap-2">
        {icon}
        <h3 className="font-medium">{title} ({entries.length})</h3>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">{emptyMsg}</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Company</th>
              <th className="px-4 py-3 text-left font-medium">Reason</th>
              <th className="px-4 py-3 text-left font-medium">Added</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{e.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.company ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.reason}</td>
                <td className="px-4 py-3 text-muted-foreground">{format(new Date(e.createdAt), "MMM d, yyyy")}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(e.id, e.name)}
                    disabled={deleting === e.id}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
