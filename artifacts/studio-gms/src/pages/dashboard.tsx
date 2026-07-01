import { useEffect } from "react";
import { Layout } from "@/components/layout";
import { GuestAvatar } from "@/components/guest-avatar";
import {
  useListGuests,
  useGetDashboardSummary,
  useGetProductionsToday,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, LogIn, LogOut, AlertTriangle, CalendarClock, Clapperboard } from "lucide-react";
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

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/guests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/productions/today"] });
    }, 30000);
    return () => clearInterval(interval);
  }, [queryClient]);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Active Visitor Dashboard</h2>
          <p className="text-muted-foreground">Live overview of studio operations.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                  <th className="px-4 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingGuests ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading operations data...</td>
                  </tr>
                ) : guests?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No active guests on site.</td>
                  </tr>
                ) : (
                  guests?.map((guest) => (
                    <tr key={guest.id} className="hover:bg-muted/30 transition-colors">
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
                      <td className="px-4 py-3 text-right">
                        {guest.isOverdue ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-destructive/20 text-destructive border border-destructive/30">
                            OVERDUE
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                            ACTIVE
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}