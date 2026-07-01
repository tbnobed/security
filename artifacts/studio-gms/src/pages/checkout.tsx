import { useState } from "react";
import { Layout } from "@/components/layout";
import { useSearchGuests, useCheckoutGuest } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Search } from "lucide-react";
import { format } from "date-fns";

export default function CheckOut() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [checkingOut, setCheckingOut] = useState<number | null>(null);

  const { data: results, isLoading } = useSearchGuests(
    { q: query },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: query.length >= 2 } as any }
  );

  const { mutateAsync: checkoutGuest } = useCheckoutGuest();

  const handleCheckout = async (id: number, name: string) => {
    setCheckingOut(id);
    try {
      await checkoutGuest({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "Guest checked out", description: `${name} has been checked out.` });
      setQuery("");
    } catch {
      toast({ title: "Checkout failed", variant: "destructive" });
    } finally {
      setCheckingOut(null);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Guest Check-Out</h2>
          <p className="text-muted-foreground">Search by name or badge ID to check out a guest.</p>
        </div>

        <div className="bg-card border border-border rounded-md p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or badge ID (e.g. GMS-A1B2C3)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          {query.length < 2 && (
            <div className="text-center py-12 text-muted-foreground">
              <LogOut className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Enter at least 2 characters to search</p>
            </div>
          )}

          {isLoading && query.length >= 2 && (
            <div className="text-center py-8 text-muted-foreground">Searching...</div>
          )}

          {results && results.length === 0 && query.length >= 2 && (
            <div className="text-center py-8 text-muted-foreground">No active guests matching "{query}"</div>
          )}

          {results && results.length > 0 && (
            <div className="divide-y divide-border">
              {results.map((guest) => (
                <div key={guest.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{guest.name}</span>
                      <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{guest.badgeId}</span>
                      {guest.isOverdue && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-destructive/20 text-destructive border border-destructive/30">
                          OVERDUE
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                      <span>{guest.company}</span>
                      <span>Host: {guest.hostName}</span>
                      <span>Site: {guest.site}</span>
                      <span>In at {format(new Date(guest.checkinAt), "HH:mm")} · {guest.timeOnSiteMinutes}m on-site</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleCheckout(guest.id, guest.name)}
                    disabled={checkingOut === guest.id}
                    variant={guest.isOverdue ? "destructive" : "default"}
                    className="shrink-0"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {checkingOut === guest.id ? "Checking out..." : "Check Out"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
