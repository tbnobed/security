import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Layout } from "@/components/layout";
import { useListGuestHistory } from "@workspace/api-client-react";
import type { Guest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GuestAvatar } from "@/components/guest-avatar";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from "lucide-react";

const PAGE_SIZE = 25;

type StatusFilter = "all" | "active" | "checked_out";
type SortBy = "name" | "company" | "hostName" | "badgeId" | "checkinAt" | "checkoutAt";
type SortDir = "asc" | "desc";

function SortableHead({
  column,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  column: SortBy;
  label: string;
  sortBy: SortBy;
  sortDir: SortDir;
  onSort: (column: SortBy) => void;
}) {
  const active = sortBy === column;
  return (
    <TableHead aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className={`flex items-center gap-1 hover:text-foreground ${active ? "text-foreground font-semibold" : ""}`}
        onClick={() => onSort(column)}
        title={`Sort by ${label}`}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function VisitLogPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy>("checkinAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const trimmedSearch = search.trim();

  useEffect(() => {
    setPage(1);
  }, [trimmedSearch, status, from, to, sortBy, sortDir]);

  const toggleSort = (column: SortBy) => {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir(column === "checkinAt" || column === "checkoutAt" ? "desc" : "asc");
    }
  };

  const { data, isLoading } = useListGuestHistory(
    {
      q: trimmedSearch || undefined,
      status,
      from: from || undefined,
      to: to || undefined,
      sortBy,
      sortDir,
      page,
      pageSize: PAGE_SIZE,
    },
    { query: { refetchInterval: 30000 } as any },
  );

  const items: Guest[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const hasFilters = trimmedSearch !== "" || status !== "all" || from !== "" || to !== "";

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setFrom("");
    setTo("");
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Visit Log</h1>
          <p className="text-sm text-muted-foreground">
            Full history of guest check-ins and check-outs.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, badge ID, or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-40">
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">On site</SelectItem>
                <SelectItem value="checked_out">Checked out</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">From</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">To</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead column="name" label="Guest" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead column="company" label="Company" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead column="hostName" label="Host" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <TableHead>Purpose</TableHead>
                <SortableHead column="badgeId" label="Badge" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead column="checkinAt" label="Checked In" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead column="checkoutAt" label="Checked Out" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground inline" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    {hasFilters ? "No visits match your filters." : "No visits recorded yet."}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="flex items-center gap-2 hover:underline text-left"
                        onClick={() => setSearch(g.name)}
                        title={`Show all visits by ${g.name}`}
                      >
                        <GuestAvatar name={g.name} photoUrl={g.photoUrl} />
                        <span className="font-medium">{g.name}</span>
                      </button>
                    </TableCell>
                    <TableCell className="max-w-36 truncate">{g.company}</TableCell>
                    <TableCell className="max-w-32 truncate">{g.hostName}</TableCell>
                    <TableCell className="max-w-40 truncate">{g.purposeOfVisit}</TableCell>
                    <TableCell className="font-mono text-xs">{g.badgeId}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(g.checkinAt), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {g.checkoutAt ? format(new Date(g.checkoutAt), "MMM d, yyyy h:mm a") : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {g.timeOnSiteMinutes != null ? formatDuration(g.timeOnSiteMinutes) : "—"}
                    </TableCell>
                    <TableCell>
                      {g.status === "active" ? (
                        g.isOverdue ? (
                          <Badge className="bg-destructive/20 text-destructive border-destructive/40">
                            Overdue
                          </Badge>
                        ) : (
                          <Badge className="bg-primary/20 text-primary border-primary/40">
                            On site
                          </Badge>
                        )
                      ) : (
                        <Badge variant="secondary">Checked out</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total === 0 ? "No visits" : `Showing ${rangeStart}–${rangeEnd} of ${total} visits`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Prev
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
