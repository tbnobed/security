import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetApprovalWorkflow,
  useUpdateApprovalWorkflow,
  useListPendingApprovals,
  useDecideApproval,
  useListUsers,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { format } from "date-fns";

const NONE = "__none__";

function AdminWorkflowConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: workflow } = useGetApprovalWorkflow();
  const { data: users } = useListUsers();
  const { mutateAsync: updateWorkflow, isPending: saving } = useUpdateApprovalWorkflow();

  const [approver1, setApprover1] = useState<string>(NONE);
  const [approver2, setApprover2] = useState<string>(NONE);

  useEffect(() => {
    if (workflow) {
      setApprover1(workflow.approver1Id ?? NONE);
      setApprover2(workflow.approver2Id ?? NONE);
    }
  }, [workflow]);

  const eligible = (users ?? []).filter((u) => u.role === "security" || u.role === "admin");

  const handleSave = async () => {
    try {
      await updateWorkflow({
        data: {
          approver1Id: approver1 === NONE ? null : approver1,
          approver2Id: approver2 === NONE ? null : approver2,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/approval-workflow"] });
      toast({ title: "Approval workflow updated" });
    } catch (err) {
      toast({
        title: "Failed to update workflow",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const dirty =
    workflow != null &&
    ((workflow.approver1Id ?? NONE) !== approver1 || (workflow.approver2Id ?? NONE) !== approver2);

  return (
    <div className="bg-card border border-border rounded-md p-4 space-y-4" data-testid="approval-workflow-config">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h3 className="font-medium">Approval Workflow</h3>
        {workflow?.enabled ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600">ENABLED</span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">OFF — auto-approve</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        When a 1st approver is set, every new pre-registration (staff, public form, and client
        portal) must be approved before check-in. With a 2nd approver, approval is sequential —
        they're only asked after the 1st approves. Clear both to disable approvals.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>1st Approver</Label>
          <Select value={approver1} onValueChange={setApprover1}>
            <SelectTrigger className="mt-1" data-testid="select-approver1">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None (approvals disabled)</SelectItem>
              {eligible.map((u) => (
                <SelectItem key={u.clerkId} value={u.clerkId}>
                  {u.displayName ?? u.email ?? u.clerkId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>2nd Approver (optional)</Label>
          <Select value={approver2} onValueChange={setApprover2}>
            <SelectTrigger className="mt-1" data-testid="select-approver2">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {eligible
                .filter((u) => u.clerkId !== approver1)
                .map((u) => (
                  <SelectItem key={u.clerkId} value={u.clerkId}>
                    {u.displayName ?? u.email ?? u.clerkId}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!dirty || saving} data-testid="button-save-workflow">
          {saving ? "Saving..." : "Save Workflow"}
        </Button>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: pending, isLoading } = useListPendingApprovals({
    query: { refetchInterval: 30000 } as any,
  });
  const { mutateAsync: decide } = useDecideApproval();
  const [deciding, setDeciding] = useState<number | null>(null);

  const handleDecide = async (id: number, action: "approve" | "deny") => {
    setDeciding(id);
    try {
      await decide({ id, data: { action } });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/preregistrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: action === "approve" ? "Approved" : "Denied" });
    } catch {
      toast({ title: "Decision failed", description: "It may already have been decided.", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/pending"] });
    } finally {
      setDeciding(null);
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Approvals</h2>
          <p className="text-muted-foreground">Pre-registrations awaiting approval.</p>
        </div>

        {user?.role === "admin" && <AdminWorkflowConfig />}

        <div className="bg-card border border-border rounded-md">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <h3 className="font-medium">Pending Approvals ({pending?.length ?? 0})</h3>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : !pending || pending.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="text-no-pending">
              No pending approvals. 🎉
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Guest</th>
                    <th className="px-4 py-3 text-left font-medium">Company</th>
                    <th className="px-4 py-3 text-left font-medium">Host</th>
                    <th className="px-4 py-3 text-left font-medium">Purpose</th>
                    <th className="px-4 py-3 text-left font-medium">Arrival</th>
                    <th className="px-4 py-3 text-left font-medium">Step</th>
                    <th className="px-4 py-3 text-right font-medium">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pending.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-approval-${p.id}`}>
                      <td className="px-4 py-3 font-medium">
                        {p.guestName}
                        {p.lateRegistration && (
                          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600" data-testid={`pill-late-${p.id}`}>
                            <AlertTriangle className="w-3 h-3" /> LATE
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.company || "—"}</td>
                      <td className="px-4 py-3">{p.hostName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.purposeOfVisit ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {format(new Date(p.expectedArrival), "MMM d, HH:mm")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">Step {p.approvalStage ?? 1}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {p.canDecide ? (
                          <>
                            <Button
                              size="sm"
                              className="mr-2"
                              onClick={() => handleDecide(p.id, "approve")}
                              disabled={deciding === p.id}
                              data-testid={`button-approve-${p.id}`}
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDecide(p.id, "deny")}
                              disabled={deciding === p.id}
                              data-testid={`button-deny-${p.id}`}
                            >
                              <XCircle className="w-3 h-3 mr-1" /> Deny
                            </Button>
                          </>
                        ) : (
                          <span
                            className="text-xs text-muted-foreground"
                            data-testid={`text-awaiting-${p.id}`}
                          >
                            Waiting on {p.awaitingApproverName ?? "approver"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
