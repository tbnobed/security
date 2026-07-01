import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListStudios,
  useCreateStudio,
  useDeleteStudio,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Trash2 } from "lucide-react";

export default function Studios() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const { data: studios, isLoading } = useListStudios();
  const { mutateAsync: createStudio, isPending: creating } = useCreateStudio();
  const { mutateAsync: deleteStudio } = useDeleteStudio();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/studios"] });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Studio name is required", variant: "destructive" });
      return;
    }
    try {
      await createStudio({ data: { name: trimmed } });
      invalidate();
      setName("");
      toast({ title: "Studio added", description: `"${trimmed}" is now selectable.` });
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } };
      toast({
        title: "Failed to add studio",
        description: apiErr?.response?.data?.error ?? undefined,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number, studioName: string) => {
    setDeleting(id);
    try {
      await deleteStudio({ id });
      invalidate();
      toast({ title: "Studio removed", description: `"${studioName}" deleted.` });
    } catch {
      toast({ title: "Deletion failed", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Studios</h2>
          <p className="text-muted-foreground">
            Manage the studios (rooms/buildings) guests can be assigned to on check-in and pre-registration.
          </p>
        </div>

        <form onSubmit={handleCreate} className="mb-6 flex items-end gap-3 bg-card border border-border rounded-md p-4">
          <div className="flex-1">
            <Label htmlFor="studio-name">New Studio Name</Label>
            <Input
              id="studio-name"
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Studio A, Bullpen, Control Room 2"
            />
          </div>
          <Button type="submit" disabled={creating}>
            <Plus className="w-4 h-4 mr-2" />
            {creating ? "Adding..." : "Add Studio"}
          </Button>
        </form>

        <div className="bg-card border border-border rounded-md">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h3 className="font-medium">Studios ({studios?.length ?? 0})</h3>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : (studios?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No studios yet. Add one above to make it selectable on the forms.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {studios?.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-3">
                  <span className="font-medium">{s.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(s.id, s.name)}
                    disabled={deleting === s.id}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}
