import { useState } from "react";
import { useGetOccupancy, useListAccessEvents } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DoorOpen, RefreshCw, AlertTriangle, ArrowRightToLine, ArrowLeftFromLine } from "lucide-react";

const STALE_AFTER_MS = 3 * 60 * 1000;

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function BuildingPage() {
  const [search, setSearch] = useState("");
  const {
    data: occupancy,
    isLoading,
    refetch: refetchOccupancy,
  } = useGetOccupancy({ query: { refetchInterval: 30000 } as any });
  const { data: eventsData, refetch: refetchEvents } = useListAccessEvents(
    { limit: 50 },
    { query: { refetchInterval: 30000 } as any },
  );

  const lastSyncAt = occupancy?.lastSyncAt ? new Date(occupancy.lastSyncAt) : null;
  const neverSynced = !isLoading && !lastSyncAt;
  const stale = lastSyncAt ? Date.now() - lastSyncAt.getTime() > STALE_AFTER_MS : false;

  const q = search.trim().toLowerCase();
  const occupants = (occupancy?.occupants ?? []).filter(
    (o) =>
      !q ||
      o.cardholderName.toLowerCase().includes(q) ||
      (o.department ?? "").toLowerCase().includes(q) ||
      (o.cardNumber ?? "").toLowerCase().includes(q),
  );
  const events = eventsData?.items ?? [];

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <DoorOpen className="w-6 h-6 text-primary" />
              Building Occupancy
            </h2>
            <p className="text-muted-foreground">
              Staff and cardholders currently in the building, reported by the access-control
              system.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              refetchOccupancy();
              refetchEvents();
            }}
            data-testid="button-occupancy-refresh"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {neverSynced && (
          <div
            className="border border-border rounded-md p-4 text-sm text-muted-foreground flex items-start gap-3"
            data-testid="banner-occupancy-unconfigured"
          >
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
            <div>
              No occupancy data has been received yet. The access-control bridge hasn't pushed a
              snapshot — check that the bridge utility is running on the LAN and that{" "}
              <code className="font-mono text-xs">MAXXESS_BRIDGE_TOKEN</code> matches on both ends.
            </div>
          </div>
        )}

        {stale && lastSyncAt && (
          <div
            className="border border-amber-500/50 bg-amber-500/10 rounded-md p-3 text-sm flex items-center gap-2"
            data-testid="banner-occupancy-stale"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
            <span>
              Occupancy data is stale — last update {fmtTime(lastSyncAt.toISOString())}. The bridge
              may be offline; treat this list as out of date.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[calc(100vh-12rem)]">
          <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="Search name, department, or card…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
                data-testid="input-occupancy-search"
              />
              <span className="text-sm text-muted-foreground" data-testid="text-occupancy-count">
                {isLoading
                  ? "Loading…"
                  : `${occupancy?.occupants.length ?? 0} in building`}
                {lastSyncAt && !stale && (
                  <span className="ml-2">· updated {fmtTime(lastSyncAt.toISOString())}</span>
                )}
              </span>
            </div>

            <div className="border border-border rounded-md overflow-x-auto overflow-y-auto h-[50vh] lg:h-auto lg:flex-1 lg:min-h-0">
              <table className="w-full text-sm" data-testid="table-occupancy">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="bg-muted/50 text-left">
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Department</th>
                    <th className="px-3 py-2 font-semibold">Last Door</th>
                    <th className="px-3 py-2 font-semibold">Since</th>
                    <th className="px-3 py-2 font-semibold">Card</th>
                  </tr>
                </thead>
                <tbody>
                  {occupants.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                        {isLoading ? "Loading…" : q ? "No matches." : "Nobody reported in the building."}
                      </td>
                    </tr>
                  ) : (
                    occupants.map((o) => (
                      <tr key={o.id} className="border-t border-border" data-testid={`row-occupant-${o.id}`}>
                        <td className="px-3 py-2 font-medium">{o.cardholderName}</td>
                        <td className="px-3 py-2">{o.department ?? "—"}</td>
                        <td className="px-3 py-2">{o.location ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {o.sinceAt ? fmtTime(o.sinceAt) : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{o.cardNumber ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-3 min-h-0">
            <h3 className="font-semibold">Recent Door Activity</h3>
            <div className="border border-border rounded-md divide-y divide-border overflow-y-auto h-[50vh] lg:h-auto lg:flex-1 lg:min-h-0" data-testid="list-access-events">
              {events.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No door events received yet.
                </div>
              ) : (
                events.map((e) => (
                  <div key={e.id} className="p-3 flex items-start gap-3 text-sm" data-testid={`row-event-${e.id}`}>
                    {e.direction === "out" ? (
                      <ArrowLeftFromLine className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ArrowRightToLine className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{e.cardholderName}</span>
                        {e.direction !== "unknown" && (
                          <Badge variant={e.direction === "out" ? "secondary" : "default"} className="text-[10px] uppercase">
                            {e.direction}
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground truncate">{e.door}</div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtTime(e.occurredAt)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
