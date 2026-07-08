import { useMemo, useState } from "react";
import { ClientLayout } from "@/components/client-layout";
import {
  useListRosterEmployees,
  useListStudios,
  useClientBulkPreregister,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { SITE_NAME } from "@/lib/site";
import { useLocation } from "wouter";
import { ClipboardList, Loader2, Search, Users } from "lucide-react";

function defaultArrival(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PortalPreregisterPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: employees, isLoading } = useListRosterEmployees();
  const { data: studioList } = useListStudios();
  const { mutateAsync: bulkPreregister, isPending: submitting } = useClientBulkPreregister();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [hostName, setHostName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [arrival, setArrival] = useState(defaultArrival());
  const [departure, setDeparture] = useState("");
  const [studios, setStudios] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!employees) return [];
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => e.name.toLowerCase().includes(q));
  }, [employees, search]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStudio = (name: string) => {
    setStudios((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((e) => next.delete(e.id));
      } else {
        filtered.forEach((e) => next.add(e.id));
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("Select at least one employee.");
      return;
    }
    if (!hostName.trim()) {
      setError("Host name is required.");
      return;
    }
    if (!arrival) {
      setError("Expected arrival is required.");
      return;
    }
    try {
      const result = await bulkPreregister({
        data: {
          employeeIds: [...selected],
          hostName: hostName.trim(),
          purposeOfVisit: purpose.trim() || undefined,
          site: SITE_NAME,
          expectedArrival: new Date(arrival).toISOString(),
          expectedDeparture: departure ? new Date(departure).toISOString() : undefined,
          studios: studios.size > 0 ? [...studios] : undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/client/visits/today"] });
      const pendingCount = result.preregistrations?.filter((p) => p.approvalStatus === "pending").length ?? 0;
      const lateCount = result.preregistrations?.filter((p) => p.lateRegistration).length ?? 0;
      toast({
        title: "Pre-registration submitted",
        description:
          pendingCount > 0
            ? `${result.created} ${result.created === 1 ? "visit" : "visits"} submitted for approval. ${
                lateCount > 0 ? "Note: less than 4 hours before arrival — flagged as late. " : ""
              }Guests can check in once approved.`
            : `${result.created} ${result.created === 1 ? "visit" : "visits"} scheduled. Security will see them in the expected list.`,
      });
      setLocation("/portal");
    } catch {
      setError("Failed to submit pre-registrations. Please try again.");
    }
  };

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Pre-Register Employees</h2>
          <p className="text-muted-foreground">
            Schedule a visit for one or more roster employees. They'll appear in security's expected list.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Employee picker */}
          <div className="bg-card border border-border rounded-md flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">
                  Employees <span className="text-muted-foreground">({selected.size} selected)</span>
                </p>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                  {allFilteredSelected ? "Deselect all" : "Select all"}
                </Button>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search employees..."
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-96">
              {isLoading ? (
                <div className="p-6 text-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  {search ? "No employees match your search." : "Your roster is empty — add employees first."}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((e) => (
                    <li key={e.id}>
                      <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
                        <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                        <div>
                          <p className="text-sm font-medium">{e.name}</p>
                          {e.title && <p className="text-xs text-muted-foreground">{e.title}</p>}
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Visit details */}
          <div className="bg-card border border-border rounded-md p-4 space-y-4 h-fit">
            <div className="space-y-1.5">
              <Label htmlFor="host">Host (who they're visiting)</Label>
              <Input
                id="host"
                required
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="Host name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purpose">Purpose of visit</Label>
              <Input
                id="purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Studio production"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="arrival">Expected arrival</Label>
                <Input
                  id="arrival"
                  type="datetime-local"
                  required
                  value={arrival}
                  onChange={(e) => setArrival(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="departure">Expected departure</Label>
                <Input
                  id="departure"
                  type="datetime-local"
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                />
              </div>
            </div>
            {studioList && studioList.length > 0 && (
              <div className="space-y-1.5">
                <Label>Studios</Label>
                <div className="grid grid-cols-2 gap-2">
                  {studioList.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Checkbox checked={studios.has(s.name)} onCheckedChange={() => toggleStudio(s.name)} />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Site: {SITE_NAME}</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ClipboardList className="w-4 h-4 mr-2" />
              )}
              Pre-Register {selected.size > 0 ? `${selected.size} ` : ""}
              {selected.size === 1 ? "Employee" : "Employees"}
            </Button>
          </div>
        </form>
      </div>
    </ClientLayout>
  );
}
