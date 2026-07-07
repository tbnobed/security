import { ClientLayout } from "@/components/client-layout";
import { useListClientVisitsToday } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CalendarClock, ClipboardList, Loader2 } from "lucide-react";
import { format } from "date-fns";

function StatusPill({ status }: { status: string }) {
  const styles =
    status === "on_site"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : status === "checked_out"
        ? "bg-muted text-muted-foreground border-border"
        : "bg-amber-500/15 text-amber-400 border-amber-500/30";
  const label = status === "on_site" ? "ON SITE" : status === "checked_out" ? "CHECKED OUT" : "EXPECTED";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${styles}`}>
      {label}
    </span>
  );
}

export default function PortalPage() {
  const { data: visits, isLoading } = useListClientVisitsToday({
    query: { refetchInterval: 30000 } as any,
  });

  const onSite = visits?.filter((v) => v.status === "on_site").length ?? 0;
  const expected = visits?.filter((v) => v.status === "expected").length ?? 0;
  const checkedOut = visits?.filter((v) => v.status === "checked_out").length ?? 0;

  return (
    <ClientLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Today's Visits</h2>
            <p className="text-muted-foreground">Live status of your pre-registered employees.</p>
          </div>
          <Link href="/portal/preregister">
            <Button className="shrink-0">
              <ClipboardList className="w-4 h-4 mr-2" />
              Pre-Register Employees
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Expected", value: expected },
            { label: "On Site", value: onSite },
            { label: "Checked Out", value: checkedOut },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-md p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-md">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 mx-auto animate-spin" />
            </div>
          ) : !visits || visits.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No visits scheduled for today.</p>
              <p className="text-sm mt-1">
                Use “Pre-Register Employees” to schedule visits.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Employee</th>
                  <th className="px-4 py-3 text-left font-medium">Host</th>
                  <th className="px-4 py-3 text-left font-medium">Studios</th>
                  <th className="px-4 py-3 text-left font-medium">Expected</th>
                  <th className="px-4 py-3 text-left font-medium">In</th>
                  <th className="px-4 py-3 text-left font-medium">Out</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visits.map((v) => (
                  <tr key={v.preregistrationId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{v.guestName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.hostName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.studios && v.studios.length > 0 ? v.studios.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(v.expectedArrival), "h:mm a")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.checkinAt ? format(new Date(v.checkinAt), "h:mm a") : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.checkoutAt ? format(new Date(v.checkoutAt), "h:mm a") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ClientLayout>
  );
}
