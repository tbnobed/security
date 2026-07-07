import { useMemo, useRef, useState } from "react";
import { ClientLayout } from "@/components/client-layout";
import {
  useListRosterEmployees,
  useCreateRosterEmployee,
  useUpdateRosterEmployee,
  useDeleteRosterEmployee,
  useImportRosterEmployees,
  useListRosterEmployeeVisits,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Upload, Pencil, Trash2, History, Loader2, Search } from "lucide-react";
import { format } from "date-fns";

interface EmployeeForm {
  name: string;
  title: string;
  phone: string;
  email: string;
}

const emptyForm: EmployeeForm = { name: "", title: "", phone: "", email: "" };

interface CsvRow {
  name: string;
  title?: string;
  phone?: string;
  email?: string;
}

/** Minimal CSV parser supporting quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim().length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim().length > 0)) rows.push(row);
  return rows;
}

function csvToRows(text: string): { rows: CsvRow[]; error: string | null } {
  const parsed = parseCsv(text);
  if (parsed.length === 0) return { rows: [], error: "The file is empty." };

  const header = parsed[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h === "name" || h === "full name" || h === "employee");
  if (nameIdx === -1) {
    return { rows: [], error: 'The CSV needs a "name" column (optionally: title, phone, email).' };
  }
  const titleIdx = header.findIndex((h) => h === "title" || h === "job title" || h === "role");
  const phoneIdx = header.findIndex((h) => h === "phone" || h === "phone number");
  const emailIdx = header.findIndex((h) => h === "email" || h === "email address");

  const rows: CsvRow[] = [];
  for (const raw of parsed.slice(1)) {
    const name = (raw[nameIdx] ?? "").trim();
    if (!name) continue;
    rows.push({
      name,
      title: titleIdx >= 0 ? (raw[titleIdx] ?? "").trim() || undefined : undefined,
      phone: phoneIdx >= 0 ? (raw[phoneIdx] ?? "").trim() || undefined : undefined,
      email: emailIdx >= 0 ? (raw[emailIdx] ?? "").trim() || undefined : undefined,
    });
  }
  if (rows.length === 0) return { rows: [], error: "No rows with a name were found." };
  if (rows.length > 500) return { rows: [], error: "Imports are limited to 500 rows at a time." };
  return { rows, error: null };
}

export default function PortalRosterPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: employees, isLoading } = useListRosterEmployees();
  const { mutateAsync: createEmployee, isPending: creating } = useCreateRosterEmployee();
  const { mutateAsync: updateEmployee, isPending: updating } = useUpdateRosterEmployee();
  const { mutateAsync: deleteEmployee, isPending: deleting } = useDeleteRosterEmployee();
  const { mutateAsync: importEmployees, isPending: importing } = useImportRosterEmployees();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/client/employees"] });

  // Add/edit dialog
  const [editTarget, setEditTarget] = useState<{ id: number } | "new" | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState("");

  // Visit history dialog
  const [historyTarget, setHistoryTarget] = useState<{ id: number; name: string } | null>(null);
  const { data: visits, isLoading: visitsLoading } = useListRosterEmployeeVisits(
    historyTarget?.id ?? 0,
    { query: { enabled: !!historyTarget } as any },
  );

  const filtered = useMemo(() => {
    if (!employees) return [];
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.name, e.title, e.email, e.phone].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [employees, search]);

  const openAdd = () => {
    setForm(emptyForm);
    setFormError(null);
    setEditTarget("new");
  };

  const openEdit = (e: NonNullable<typeof employees>[number]) => {
    setForm({ name: e.name, title: e.title ?? "", phone: e.phone ?? "", email: e.email ?? "" });
    setFormError(null);
    setEditTarget({ id: e.id });
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    try {
      if (editTarget === "new") {
        await createEmployee({
          data: {
            name: form.name.trim(),
            title: form.title.trim() || undefined,
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
          },
        });
        toast({ title: "Employee added", description: form.name.trim() });
      } else if (editTarget) {
        await updateEmployee({
          id: editTarget.id,
          data: {
            name: form.name.trim(),
            title: form.title.trim() || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
          },
        });
        toast({ title: "Employee updated", description: form.name.trim() });
      }
      refresh();
      setEditTarget(null);
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      setFormError(
        status === 409
          ? "An employee with this name is already on your roster."
          : "Failed to save. Check the details and try again.",
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEmployee({ id: deleteTarget.id });
      refresh();
      toast({ title: "Employee removed", description: deleteTarget.name });
      setDeleteTarget(null);
    } catch {
      toast({ title: "Failed to remove employee", variant: "destructive" });
    }
  };

  const handleFile = (file: File) => {
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const { rows, error } = csvToRows(String(reader.result ?? ""));
      setCsvRows(error ? null : rows);
      setCsvError(error);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvRows || csvRows.length === 0) return;
    try {
      const result = await importEmployees({ data: { rows: csvRows } });
      refresh();
      toast({
        title: "Import complete",
        description: `${result.imported} added, ${result.skipped} already on roster${result.errors.length > 0 ? `, ${result.errors.length} failed` : ""}.`,
      });
      setCsvRows(null);
      setCsvError(null);
      setCsvFileName("");
    } catch {
      toast({ title: "Import failed", variant: "destructive" });
    }
  };

  return (
    <ClientLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Employee Roster</h2>
            <p className="text-muted-foreground">
              Manage the employees you can pre-register for studio visits.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </Button>
            <Button onClick={openAdd}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add Employee
            </Button>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, title, phone, or email..."
            className="pl-9"
          />
        </div>

        <div className="bg-card border border-border rounded-md">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 mx-auto animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>{search ? "No employees match your search." : "No employees on your roster yet."}</p>
              {!search && (
                <p className="text-sm mt-1">Add employees one by one or import a CSV file.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">Phone</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{e.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.title ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.email ?? "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setHistoryTarget({ id: e.id, name: e.name })}
                      >
                        <History className="w-3.5 h-3.5 mr-1.5" />
                        Visits
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => openEdit(e)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ id: e.id, name: e.name })}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editTarget === "new" ? "Add Employee" : "Edit Employee"}</DialogTitle>
              <DialogDescription>
                Employee details are used to pre-fill their visit pre-registrations.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="emp-name">Full name</Label>
                <Input
                  id="emp-name"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-title">Job title</Label>
                <Input
                  id="emp-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Producer"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="emp-phone">Phone</Label>
                  <Input
                    id="emp-phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="emp-email">Email</Label>
                  <Input
                    id="emp-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="jane@company.com"
                  />
                </div>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || updating}>
                {(creating || updating) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editTarget === "new" ? "Add Employee" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Employee</DialogTitle>
            <DialogDescription>
              Remove {deleteTarget?.name} from your roster? Past visit records are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV import preview */}
      <Dialog
        open={!!csvRows || !!csvError}
        onOpenChange={(o) => {
          if (!o) {
            setCsvRows(null);
            setCsvError(null);
            setCsvFileName("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Employees</DialogTitle>
            <DialogDescription>
              {csvError
                ? csvFileName
                : `${csvFileName} — ${csvRows?.length ?? 0} employees found. Duplicates already on your roster will be skipped.`}
            </DialogDescription>
          </DialogHeader>
          {csvError ? (
            <p className="text-sm text-destructive py-2">{csvError}</p>
          ) : (
            <div className="max-h-72 overflow-y-auto border border-border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Phone</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {csvRows?.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.title ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.phone ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCsvRows(null);
                setCsvError(null);
                setCsvFileName("");
              }}
            >
              Cancel
            </Button>
            {!csvError && (
              <Button onClick={handleImport} disabled={importing}>
                {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Import {csvRows?.length ?? 0} Employees
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visit history */}
      <Dialog open={!!historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Visit History — {historyTarget?.name}</DialogTitle>
            <DialogDescription>Pre-registered visits and their outcomes.</DialogDescription>
          </DialogHeader>
          {visitsLoading ? (
            <div className="p-6 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 mx-auto animate-spin" />
            </div>
          ) : !visits || visits.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No visits on record.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto border border-border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Host</th>
                    <th className="px-3 py-2 text-left font-medium">In</th>
                    <th className="px-3 py-2 text-left font-medium">Out</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visits.map((v) => (
                    <tr key={v.preregistrationId}>
                      <td className="px-3 py-2">{format(new Date(v.expectedArrival), "MMM d, yyyy")}</td>
                      <td className="px-3 py-2 text-muted-foreground">{v.hostName ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {v.checkinAt ? format(new Date(v.checkinAt), "h:mm a") : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {v.checkoutAt ? format(new Date(v.checkoutAt), "h:mm a") : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {v.status === "on_site" ? "On site" : v.status === "checked_out" ? "Checked out" : "Expected"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
}
