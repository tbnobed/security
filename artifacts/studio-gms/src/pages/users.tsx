import { useState } from "react";
import { Layout } from "@/components/layout";
import { useListUsers, useUpdateUserRole, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users } from "lucide-react";
import { format } from "date-fns";

export default function UsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);

  const { data: users, isLoading } = useListUsers();
  const { data: me } = useGetMe();
  const { mutateAsync: updateRole } = useUpdateUserRole();

  const handleRoleChange = async (clerkId: string, role: "security" | "admin") => {
    setUpdating(clerkId);
    try {
      await updateRole({ clerkId, data: { role } });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Role updated", description: `User role changed to ${role}` });
    } catch {
      toast({ title: "Failed to update role", variant: "destructive" });
    } finally {
      setUpdating(null);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground">Manage operator roles and access levels.</p>
        </div>

        <div className="bg-card border border-border rounded-md mb-4 p-4 flex items-start gap-3">
          <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Roles: </span>
            <strong>Security</strong> — can check guests in/out and view the dashboard.
            {" "}<strong>Admin</strong> — all security permissions plus watchlist, audit log, and user management.
            Users are provisioned automatically on first sign-in.
          </div>
        </div>

        <div className="bg-card border border-border rounded-md">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading users...</div>
          ) : !users || users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No users yet. Users appear after their first sign-in.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Added</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
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
                          onValueChange={(v: "security" | "admin") => handleRoleChange(user.clerkId, v)}
                          disabled={updating === user.clerkId}
                        >
                          <SelectTrigger className="w-36 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="security">Security</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
