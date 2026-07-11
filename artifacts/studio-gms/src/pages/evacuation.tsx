import { useEffect, useState } from "react";
import { useListGuests, useGetOccupancy } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Printer, RefreshCw, Siren, AlertTriangle } from "lucide-react";
import { SITE_NAME } from "@/lib/site";

const OCCUPANCY_STALE_AFTER_MS = 3 * 60 * 1000;

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EvacuationPage() {
  const { data: guests, isLoading, refetch, dataUpdatedAt } = useListGuests(
    { status: "active" },
    { query: { refetchInterval: 15000 } as any },
  );
  const { data: occupancy, refetch: refetchOccupancy } = useGetOccupancy({
    query: { refetchInterval: 15000 } as any,
  });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  const active = (guests ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const generatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : now;

  // Cardholders reported by the access-control bridge (empty + never-synced =
  // no bridge configured; hide the section entirely).
  const occupants = (occupancy?.occupants ?? [])
    .slice()
    .sort((a, b) => a.cardholderName.localeCompare(b.cardholderName));
  const occupancyLastSync = occupancy?.lastSyncAt ? new Date(occupancy.lastSyncAt) : null;
  const showOccupancy = occupancyLastSync !== null || occupants.length > 0;
  const occupancyStale = occupancyLastSync
    ? now.getTime() - occupancyLastSync.getTime() > OCCUPANCY_STALE_AFTER_MS
    : false;

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 print:p-0 print:space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Siren className="w-6 h-6 text-destructive" />
              Emergency Evacuation Roster
            </h2>
            <p className="text-muted-foreground">
              Everyone currently on site. Auto-refreshes every 15 seconds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                refetch();
                refetchOccupancy();
              }}
              data-testid="button-evac-refresh"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={() => window.print()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-evac-print"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Roster
            </Button>
          </div>
        </div>

        {/* Print header */}
        <div className="hidden print:block">
          <h1 className="text-xl font-bold text-black">EMERGENCY EVACUATION ROSTER — {SITE_NAME}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground print:text-black">
          <span data-testid="text-evac-count" className="font-semibold text-foreground print:text-black text-base">
            {isLoading
              ? "Loading…"
              : `${active.length} ${active.length === 1 ? "visitor" : "visitors"} on site${
                  showOccupancy ? ` · ${occupants.length} ${occupants.length === 1 ? "cardholder" : "cardholders"} in building` : ""
                }`}
          </span>
          <span data-testid="text-evac-generated">
            Generated {generatedAt.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>

        {!isLoading && active.length === 0 ? (
          <div className="border border-border rounded-md p-10 text-center text-muted-foreground print:text-black">
            No guests are currently on site.
          </div>
        ) : (
          <div className="border border-border rounded-md overflow-hidden print:border-black print:rounded-none">
            <table className="w-full text-sm print:text-black" data-testid="table-evacuation">
              <thead>
                <tr className="bg-muted/50 text-left print:bg-transparent print:border-b-2 print:border-black">
                  <th className="px-3 py-2 font-semibold w-12 print:px-1">#</th>
                  <th className="px-3 py-2 font-semibold print:px-1">Guest</th>
                  <th className="px-3 py-2 font-semibold print:px-1">Company</th>
                  <th className="px-3 py-2 font-semibold print:px-1">Host</th>
                  <th className="px-3 py-2 font-semibold print:px-1">Studios</th>
                  <th className="px-3 py-2 font-semibold print:px-1">Badge</th>
                  <th className="px-3 py-2 font-semibold print:px-1">Checked In</th>
                  <th className="px-3 py-2 font-semibold w-28 print:px-1">Accounted For</th>
                </tr>
              </thead>
              <tbody>
                {active.map((g, i) => (
                  <tr
                    key={g.id}
                    className="border-t border-border print:border-gray-400 print:break-inside-avoid"
                    data-testid={`row-evac-${g.id}`}
                  >
                    <td className="px-3 py-2 text-muted-foreground print:text-black print:px-1">{i + 1}</td>
                    <td className="px-3 py-2 print:px-1">
                      <div className="flex items-center gap-2">
                        {g.photoUrl ? (
                          <img
                            src={g.photoUrl}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover shrink-0 print:w-7 print:h-7"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 print:border print:border-gray-400 print:w-7 print:h-7">
                            {g.name
                              .split(/\s+/)
                              .map((p) => p.charAt(0))
                              .slice(0, 2)
                              .join("")
                              .toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium">{g.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 print:px-1">{g.company}</td>
                    <td className="px-3 py-2 print:px-1">{g.hostName}</td>
                    <td className="px-3 py-2 print:px-1">{g.studios && g.studios.length > 0 ? g.studios.join(", ") : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs print:px-1">{g.badgeId}</td>
                    <td className="px-3 py-2 whitespace-nowrap print:px-1">{fmtTime(g.checkinAt)}</td>
                    <td className="px-3 py-2 print:px-1">
                      <span className="hidden print:inline-block w-5 h-5 border-2 border-black rounded-sm align-middle" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showOccupancy && (
          <div className="space-y-2 print:break-inside-avoid">
            <h3 className="font-semibold text-lg print:text-black flex items-center gap-2">
              Staff &amp; Cardholders
              <span className="text-sm font-normal text-muted-foreground print:text-black">
                (from access control)
              </span>
            </h3>
            {occupancyStale && occupancyLastSync && (
              <div
                className="border border-amber-500/50 bg-amber-500/10 rounded-md p-2 text-sm flex items-center gap-2 print:border-black print:bg-transparent print:text-black"
                data-testid="banner-evac-occupancy-stale"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 print:text-black" />
                <span>
                  Access-control data last updated {fmtTime(occupancyLastSync.toISOString())} — may
                  be out of date.
                </span>
              </div>
            )}
            {occupants.length === 0 ? (
              <div className="border border-border rounded-md p-6 text-center text-muted-foreground print:text-black">
                No cardholders reported in the building.
              </div>
            ) : (
              <div className="border border-border rounded-md overflow-hidden print:border-black print:rounded-none">
                <table className="w-full text-sm print:text-black" data-testid="table-evac-occupancy">
                  <thead>
                    <tr className="bg-muted/50 text-left print:bg-transparent print:border-b-2 print:border-black">
                      <th className="px-3 py-2 font-semibold w-12 print:px-1">#</th>
                      <th className="px-3 py-2 font-semibold print:px-1">Name</th>
                      <th className="px-3 py-2 font-semibold print:px-1">Department</th>
                      <th className="px-3 py-2 font-semibold print:px-1">Last Seen At</th>
                      <th className="px-3 py-2 font-semibold print:px-1">Since</th>
                      <th className="px-3 py-2 font-semibold w-28 print:px-1">Accounted For</th>
                    </tr>
                  </thead>
                  <tbody>
                    {occupants.map((o, i) => (
                      <tr
                        key={o.id}
                        className="border-t border-border print:border-gray-400 print:break-inside-avoid"
                        data-testid={`row-evac-occupant-${o.id}`}
                      >
                        <td className="px-3 py-2 text-muted-foreground print:text-black print:px-1">{i + 1}</td>
                        <td className="px-3 py-2 font-medium print:px-1">{o.cardholderName}</td>
                        <td className="px-3 py-2 print:px-1">{o.department ?? "—"}</td>
                        <td className="px-3 py-2 print:px-1">{o.location ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap print:px-1">
                          {o.sinceAt ? fmtTime(o.sinceAt) : "—"}
                        </td>
                        <td className="px-3 py-2 print:px-1">
                          <span className="hidden print:inline-block w-5 h-5 border-2 border-black rounded-sm align-middle" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <p className="hidden print:block text-xs text-black pt-2">
          Muster point roll call: check the box for each person accounted for. Report anyone missing to the incident
          commander immediately.
        </p>
      </div>
    </Layout>
  );
}
