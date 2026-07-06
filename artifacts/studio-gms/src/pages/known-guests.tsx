import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Layout } from "@/components/layout";
import {
  useListKnownGuests,
  useUpdateKnownGuest,
  useDeleteKnownGuest,
  useListKnownGuestVisits,
} from "@workspace/api-client-react";
import type { KnownGuest } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GuestAvatar } from "@/components/guest-avatar";
import { useToast } from "@/hooks/use-toast";
import { Star, Search, UserPlus, History, Loader2, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;

function VisitHistoryDialog({ guest, onClose }: { guest: KnownGuest; onClose: () => void }) {
  const { data: visits, isLoading } = useListKnownGuestVisits(guest.id);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <GuestAvatar name={guest.name} photoUrl={guest.photoUrl} />
            <span>
              {guest.name}
              <span className="block text-sm font-normal text-muted-foreground">
                {guest.visitCount} visit{guest.visitCount === 1 ? "" : "s"}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Badge</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(visits ?? []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(v.checkinAt), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell>{v.hostName}</TableCell>
                    <TableCell className="max-w-40 truncate">{v.purposeOfVisit}</TableCell>
                    <TableCell className="font-mono text-xs">{v.badgeId}</TableCell>
                    <TableCell>
                      {v.status === "active" ? (
                        <Badge className="bg-primary/20 text-primary border-primary/40">On site</Badge>
                      ) : (
                        <Badge variant="secondary">Checked out</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(visits ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      No visits recorded.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditKnownGuestDialog({
  guest,
  onClose,
  onSaved,
}: {
  guest: KnownGuest;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { mutateAsync: updateKnownGuest, isPending } = useUpdateKnownGuest();
  const [name, setName] = useState(guest.name);
  const [company, setCompany] = useState(guest.company ?? "");
  const [phone, setPhone] = useState(guest.phone ?? "");
  const [email, setEmail] = useState(guest.email ?? "");

  const save = async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      await updateKnownGuest({
        id: guest.id,
        data: {
          name: name.trim(),
          company: company.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
        },
      });
      toast({ title: "Guest updated", description: name.trim() });
      onSaved();
      onClose();
    } catch (err) {
      const apiErr = err as { response?: { status?: number; data?: { error?: string } } };
      const msg =
        apiErr?.response?.status === 409
          ? "Another known guest already has that name."
          : apiErr?.response?.data?.error || "Update failed";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit known guest</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              data-testid="input-edit-name"
            />
          </div>
          <div>
            <Label htmlFor="edit-company">Company</Label>
            <Input
              id="edit-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="mt-1"
              data-testid="input-edit-company"
            />
          </div>
          <div>
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1"
              data-testid="input-edit-phone"
            />
          </div>
          <div>
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
              data-testid="input-edit-email"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isPending} data-testid="button-save-known-guest">
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KnownGuestsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [historyGuest, setHistoryGuest] = useState<KnownGuest | null>(null);
  const [editGuest, setEditGuest] = useState<KnownGuest | null>(null);
  const [deleteGuest, setDeleteGuest] = useState<KnownGuest | null>(null);

  const trimmedSearch = search.trim();

  useEffect(() => {
    setPage(1);
  }, [trimmedSearch, vipOnly]);

  const { data, isLoading } = useListKnownGuests({
    q: trimmedSearch || undefined,
    vip: vipOnly || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const guests = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/known-guests"] });

  const { mutateAsync: updateKnownGuest } = useUpdateKnownGuest();
  const { mutateAsync: deleteKnownGuest, isPending: isDeleting } = useDeleteKnownGuest();

  const toggleVip = async (kg: KnownGuest) => {
    try {
      await updateKnownGuest({ id: kg.id, data: { isVip: !kg.isVip } });
      invalidate();
      toast({
        title: !kg.isVip ? "Marked as VIP" : "VIP removed",
        description: kg.name,
      });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteGuest) return;
    try {
      await deleteKnownGuest({ id: deleteGuest.id });
      invalidate();
      toast({ title: "Guest deleted", description: deleteGuest.name });
      setDeleteGuest(null);
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const quickCheckIn = (kg: KnownGuest) => {
    sessionStorage.setItem(
      "checkin-prefill",
      JSON.stringify({
        name: kg.name,
        company: kg.company ?? "",
        phone: kg.phone ?? "",
        email: kg.email ?? "",
        photoUrl: kg.photoUrl ?? undefined,
      }),
    );
    setLocation("/checkin");
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Known Guests</h2>
            <p className="text-muted-foreground">
              Returning visitors with history, plus VIP designations.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or company"
                className="pl-8 w-64"
                data-testid="input-search-known-guests"
              />
            </div>
            <Button
              variant={vipOnly ? "default" : "outline"}
              onClick={() => setVipOnly((v) => !v)}
              data-testid="button-vip-filter"
            >
              <Star className={`w-4 h-4 mr-2 ${vipOnly ? "fill-current" : ""}`} /> VIPs
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-center">Visits</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : guests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    {search || vipOnly ? "No matching known guests." : "No known guests yet — they appear automatically after their first check-in."}
                  </TableCell>
                </TableRow>
              ) : (
                guests.map((kg) => (
                  <TableRow key={kg.id} data-testid={`row-known-guest-${kg.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <GuestAvatar name={kg.name} photoUrl={kg.photoUrl} />
                        <div className="flex items-center gap-1.5 font-medium">
                          {kg.name}
                          <button
                            type="button"
                            onClick={() => toggleVip(kg)}
                            title={kg.isVip ? "Remove VIP" : "Mark as VIP"}
                            className="p-0.5 rounded hover:bg-accent"
                            data-testid={`button-vip-${kg.id}`}
                          >
                            <Star
                              className={`w-4 h-4 ${kg.isVip ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
                            />
                          </button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{kg.company || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {kg.phone || kg.email || "—"}
                    </TableCell>
                    <TableCell className="text-center">{kg.visitCount}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {kg.lastVisitAt ? format(new Date(kg.lastVisitAt), "MMM d, yyyy h:mm a") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryGuest(kg)}
                          data-testid={`button-history-${kg.id}`}
                        >
                          <History className="w-4 h-4 mr-1" /> History
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditGuest(kg)}
                          data-testid={`button-edit-${kg.id}`}
                        >
                          <Pencil className="w-4 h-4 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteGuest(kg)}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-${kg.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Delete
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => quickCheckIn(kg)}
                          data-testid={`button-checkin-${kg.id}`}
                        >
                          <UserPlus className="w-4 h-4 mr-1" /> Check In
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {total > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground" data-testid="text-pagination-range">
              Showing {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                data-testid="button-next-page"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {historyGuest && <VisitHistoryDialog guest={historyGuest} onClose={() => setHistoryGuest(null)} />}
      {editGuest && (
        <EditKnownGuestDialog
          guest={editGuest}
          onClose={() => setEditGuest(null)}
          onSaved={invalidate}
        />
      )}

      <AlertDialog open={!!deleteGuest} onOpenChange={(open) => !open && setDeleteGuest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete known guest?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <span className="font-medium">{deleteGuest?.name}</span> from the known-guests
              directory. Their past visit records are kept in the audit log. If they check in again, a new
              profile is created automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
