import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListAuditLog } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText } from "lucide-react";
import { format } from "date-fns";

const EVENT_LABELS: Record<string, { label: string; className: string }> = {
  checkin: { label: "CHECK IN", className: "bg-primary/20 text-primary border-primary/30" },
  checkout: { label: "CHECK OUT", className: "bg-muted text-muted-foreground border-border" },
  preregistration: { label: "PRE-REG", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  watchlist_flag: { label: "WATCHLIST", className: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30" },
  denied_entry: { label: "DENIED", className: "bg-destructive/20 text-destructive border-destructive/30" },
  user_created: { label: "USER", className: "bg-muted text-muted-foreground border-border" },
  role_changed: { label: "ROLE CHG", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  badge_logo_updated: { label: "BADGE LOGO", className: "bg-muted text-muted-foreground border-border" },
  badge_logo_removed: { label: "BADGE LOGO", className: "bg-muted text-muted-foreground border-border" },
};

const today = () => new Date().toISOString().slice(0, 10);
const sevenDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

export default function Audit() {
  const [startDate, setStartDate] = useState(sevenDaysAgo());
  const [endDate, setEndDate] = useState(today());

  const { data: entries, isLoading } = useListAuditLog({ startDate, endDate, limit: 500 });

  const handleExport = () => {
    const url = `/api/audit/export?startDate=${startDate}&endDate=${endDate}`;
    window.open(url, "_blank");
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
            <p className="text-muted-foreground">Immutable record of all security events.</p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>

        <div className="bg-card border border-border rounded-md mb-4 p-4 flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs mb-1 block">From</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">To</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          </div>
          <div className="text-sm text-muted-foreground">
            {entries ? `${entries.length} events` : ""}
          </div>
        </div>

        <div className="bg-card border border-border rounded-md">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading audit log...</div>
          ) : !entries || entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No events in this date range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                    <th className="px-4 py-3 text-left font-medium">Event</th>
                    <th className="px-4 py-3 text-left font-medium">Guest</th>
                    <th className="px-4 py-3 text-left font-medium">Operator</th>
                    <th className="px-4 py-3 text-left font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-xs">
                  {entries.map((e) => {
                    const label = EVENT_LABELS[e.eventType] ?? { label: e.eventType.toUpperCase(), className: "bg-muted text-muted-foreground border-border" };
                    let metadata: Record<string, unknown> = {};
                    try { metadata = e.metadata ? JSON.parse(e.metadata) : {}; } catch { /* */ }
                    return (
                      <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                          {format(new Date(e.timestamp), "MMM d HH:mm:ss")}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${label.className}`}>
                            {label.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-sans font-medium">{e.guestName}</td>
                        <td className="px-4 py-2 text-muted-foreground font-sans">{e.operatorName}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {metadata.badgeId ? `Badge: ${metadata.badgeId}` : ""}
                          {metadata.site ? ` · ${metadata.site}` : ""}
                          {metadata.newRole ? `→ ${metadata.newRole}` : ""}
                          {metadata.action ? `Action: ${metadata.action}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
