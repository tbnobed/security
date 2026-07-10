import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { GuestAvatar } from "@/components/guest-avatar";
import {
  useListGuests,
  useGetDashboardSummary,
  useGetProductionsToday,
  useMarkBadgePrinted,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VisitorBadge, type VisitorBadgeData } from "@/components/visitor-badge";
import { printBadge } from "@/lib/print-badge";
import { BadgeSizeControl } from "@/components/badge-size-control";
import {
  Users,
  LogIn,
  LogOut,
  AlertTriangle,
  CalendarClock,
  Clapperboard,
  Printer,
} from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: guests, isLoading: loadingGuests } = useListGuests({ status: "active" });
  const { data: summary } = useGetDashboardSummary();
  const {
    data: productions,
    isLoading: loadingProductions,
    isError: productionsError,
  } = useGetProductionsToday();

  const [printData, setPrintData] = useState<VisitorBadgeData | null>(null);

  const markPrinted = useMarkBadgePrinted({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      },
    },
  });

  const needsBadge = (g: { checkinSource?: string; badgePrintedAt?: string | null }) =>
    g.checkinSource === "kiosk" && !g.badgePrintedAt;

  // Self-check-in guests awaiting a printed badge float to the top of the list.
  const sortedGuests = guests
    ? [...guests].sort((a, b) => Number(needsBadge(b)) - Number(needsBadge(a)))
    : guests;

  const needsBadgeCount = guests?.filter(needsBadge).length ?? 0;

  const handlePrint = (guest: NonNullable<typeof guests>[number]) => {
    setPrintData({
      badgeId: guest.badgeId,
      name: guest.name,
      company: guest.company,
      host: guest.hostName,
      site: guest.site,
      studios: guest.studios ?? [],
      purpose: guest.purposeOfVisit,
      checkinAt: guest.checkinAt,
      expectedDeparture: guest.expectedDeparture ?? null,
      photo: guest.photoUrl ?? null,
    });
    if (needsBadge(guest)) {
      markPrinted.mutate({ id: guest.id });
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/productions/today"] });
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  // Print the off-screen badge once it has rendered, then clear it.
  useEffect(() => {
    if (!printData) return undefined;
    const t = setTimeout(() => {
      printBadge();
      setPrintData(null);
    }, 100);
    return () => clearTimeout(t);
  }, [printData]);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Active Visitor Dashboard</h2>
            <p className="text-muted-foreground">Live overview of studio operations.</p>
          </div>
          <BadgeSizeControl />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active On-Site</CardTitle>
              <Users className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.activeGuestCount || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Today's Check-ins</CardTitle>
              <LogIn className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.todayCheckins || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Today's Check-outs</CardTitle>
              <LogOut className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.todayCheckouts || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-card border-destructive/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-destructive">Overdue</CardTitle>
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{summary?.overdueCount || 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Expected Today</CardTitle>
              <CalendarClock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.expectedTodayCount || 0}</div>
            </CardContent>
          </Card>
        </div>

        <div className="bg-card border border-border rounded-md shadow-sm">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-primary" />
              <h3 className="font-medium">Productions Today</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {productions?.length ? `${productions.length} scheduled` : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Production</th>
                  <th className="px-4 py-3 font-medium">Studio</th>
                  <th className="px-4 py-3 font-medium">Start</th>
                  <th className="px-4 py-3 font-medium">End</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingProductions ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading productions...</td>
                  </tr>
                ) : productionsError ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-destructive">Unable to load productions from the bookings service.</td>
                  </tr>
                ) : productions?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No productions scheduled today.</td>
                  </tr>
                ) : (
                  productions?.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {p.color ? (
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: p.color }}
                            />
                          ) : null}
                          {p.title}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.studioId ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{format(new Date(p.start), "HH:mm")}</td>
                      <td className="px-4 py-3 text-muted-foreground">{format(new Date(p.end), "HH:mm")}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{p.type}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground border border-border capitalize">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card border border-border rounded-md shadow-sm">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-medium">Active Guests</h3>
            {needsBadgeCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <Printer className="w-3.5 h-3.5" />
                {needsBadgeCount} {needsBadgeCount === 1 ? "badge" : "badges"} to print
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Host</th>
                  <th className="px-4 py-3 font-medium">Check In</th>
                  <th className="px-4 py-3 font-medium">Studios</th>
                  <th className="px-4 py-3 font-medium">Time On-Site</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Badge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingGuests ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading operations data...</td>
                  </tr>
                ) : sortedGuests?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No active guests on site.</td>
                  </tr>
                ) : (
                  sortedGuests?.map((guest) => {
                    const awaitingBadge = needsBadge(guest);
                    return (
                    <tr
                      key={guest.id}
                      className={
                        awaitingBadge
                          ? "bg-amber-500/10 hover:bg-amber-500/15 transition-colors"
                          : "hover:bg-muted/30 transition-colors"
                      }
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-3">
                          <GuestAvatar name={guest.name} photoUrl={guest.photoUrl} />
                          <span>{guest.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{guest.company}</td>
                      <td className="px-4 py-3">{guest.hostName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{format(new Date(guest.checkinAt), "HH:mm")}</td>
                      <td className="px-4 py-3 text-muted-foreground">{guest.studios?.length ? guest.studios.join(", ") : "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{guest.timeOnSiteMinutes}m</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {awaitingBadge && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40">
                              <Printer className="w-3 h-3" /> NEEDS BADGE
                            </span>
                          )}
                          {guest.isOverdue ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-destructive/20 text-destructive border border-destructive/30">
                              OVERDUE
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                              ACTIVE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant={awaitingBadge ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePrint(guest)}
                          data-testid={`button-print-badge-${guest.id}`}
                        >
                          <Printer className="w-4 h-4 mr-1.5" /> Print Badge
                        </Button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Off-screen source for badge printing (printBadge clones #print-badge). */}
      {printData && (
        <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
          <VisitorBadge data={printData} />
        </div>
      )}
    </Layout>
  );
}