import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListUsers,
  useUpdateUserRole,
  useGetMe,
  useCreateUser,
  useResetUserPassword,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, UserPlus, KeyRound, Loader2 } from "lucide-react";
import { format } from "date-fns";

type Role = "security" | "admin" | "kiosk";

export default function UsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);

  const { data: users, isLoading } = useListUsers();
  const { data: me } = useGetMe();
  const { mutateAsync: updateRole } = useUpdateUserRole();
  const { mutateAsync: createUser, isPending: creating } = useCreateUser();
  const { mutateAsync: resetPassword, isPending: resetting } = useResetUserPassword();

  // Add-operator dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("security");
  const [newPassword, setNewPassword] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Reset-password dialog state
  const [resetTarget, setResetTarget] = useState<{ clerkId: string; name: string } | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: ["/api/users"] });

  const handleRoleChange = async (clerkId: string, role: Role) => {
    setUpdating(clerkId);
    try {
      await updateRole({ clerkId, data: { role } });
      refreshUsers();
      toast({ title: "Role updated", description: `User role changed to ${role}` });
    } catch {
      toast({ title: "Failed to update role", variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  const resetAddForm = () => {
    setNewEmail("");
    setNewName("");
    setNewRole("security");
    setNewPassword("");
    setAddError(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (newPassword.length < 8) {
      setAddError("Password must be at least 8 characters.");
      return;
    }

    try {
      await createUser({
        data: {
          email: newEmail.trim(),
          password: newPassword,
          displayName: newName.trim() || undefined,
          role: newRole,
        },
      });
      refreshUsers();
      toast({ title: "Operator added", description: `${newEmail.trim()} can now sign in.` });
      setAddOpen(false);
      resetAddForm();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      setAddError(
        status === 409
          ? "A user with this email already exists."
          : "Failed to add operator. Check the details and try again.",
      );
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);

    if (resetPasswordValue.length < 8) {
      setResetError("Password must be at least 8 characters.");
      return;
    }

    try {
      await resetPassword({ clerkId: resetTarget.clerkId, data: { password: resetPasswordValue } });
      toast({ title: "Password reset", description: `New password set for ${resetTarget.name}.` });
      setResetTarget(null);
      setResetPasswordValue("");
    } catch {
      setResetError("Failed to reset password. Please try again.");
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
            <p className="text-muted-foreground">Manage operators, roles, and access levels.</p>
          </div>
          <Button onClick={() => { resetAddForm(); setAddOpen(true); }} className="shrink-0">
            <UserPlus className="w-4 h-4 mr-2" />
            Add Operator
          </Button>
        </div>

        <div className="bg-card border border-border rounded-md mb-4 p-4 flex items-start gap-3">
          <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Roles: </span>
            <strong>Security</strong> — can check guests in/out and view the dashboard.
            {" "}<strong>Admin</strong> — all security permissions plus watchlist, audit log, and user management.
            {" "}<strong>Kiosk</strong> — locked to the self-service check-in screen only (use for the lobby tablet).
            Operators are created here by an administrator with an email and initial password.
          </div>
        </div>

        <div className="bg-card border border-border rounded-md">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading users...</div>
          ) : !users || users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No operators yet. Use “Add Operator” to create one.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Added</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.clerkId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                          {(user.displayName ?? user.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">{user.displayName ?? "—"}</div>
                          {user.clerkId === me?.clerkId && (
                            <div className="text-xs text-primary">You</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{format(new Date(user.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3">
                      {user.clerkId === me?.clerkId ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${user.role === "admin" ? "bg-primary/20 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"}`}>
                          {user.role.toUpperCase()}
                        </span>
                      ) : (
                        <Select
                          value={user.role}
                          onValueChange={(v: Role) => handleRoleChange(user.clerkId, v)}
                          disabled={updating === user.clerkId}
                        >
                          <SelectTrigger className="w-36 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="security">Security</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="kiosk">Kiosk</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setResetError(null);
                          setResetPasswordValue("");
                          setResetTarget({ clerkId: user.clerkId, name: user.displayName ?? user.email ?? user.clerkId });
                        }}
                      >
                        <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                        Reset Password
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add operator dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAddForm(); }}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Add Operator</DialogTitle>
              <DialogDescription>
                Create a new operator account. They sign in with the email and password you set here.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  autoComplete="off"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="operator@studiogms.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-name">Display name</Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-role">Role</Label>
                <Select value={newRole} onValueChange={(v: Role) => setNewRole(v)}>
                  <SelectTrigger id="new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="kiosk">Kiosk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Initial password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              {addError && <p className="text-sm text-destructive">{addError}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Operator
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetPasswordValue(""); setResetError(null); } }}>
        <DialogContent>
          <form onSubmit={handleReset}>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Set a new password for {resetTarget?.name}. They'll use it on their next sign-in.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              {resetError && <p className="text-sm text-destructive">{resetError}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={resetting}>
                {resetting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Reset Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
