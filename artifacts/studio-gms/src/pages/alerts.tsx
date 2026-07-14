import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListAlertRecipients,
  useCreateAlertRecipient,
  useDeleteAlertRecipient,
  useGetAlertStatus,
  useGetAutoCheckoutSettings,
  useUpdateAutoCheckoutSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Bell, Mail, MailWarning, Trash2, Loader2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

type EventType = "preregistration" | "checkin" | "checkout" | "overdue";

const EVENT_SECTIONS: { type: EventType; label: string; description: string }[] = [
  {
    type: "preregistration",
    label: "Pre-Registration",
    description: "When a guest is pre-registered (by an operator or via the public form).",
  },
  {
    type: "checkin",
    label: "Check-In",
    description: "When a guest checks in — including pre-registrations converted to a visit.",
  },
  {
    type: "checkout",
    label: "Check-Out",
    description: "When a guest checks out.",
  },
  {
    type: "overdue",
    label: "Overdue",
    description: "When an active guest passes their expected departure without checking out.",
  },
];

export default function AlertsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recipients, isLoading } = useListAlertRecipients();
  const { data: status } = useGetAlertStatus();
  const { mutateAsync: createRecipient, isPending: creating } = useCreateAlertRecipient();
  const { mutateAsync: deleteRecipient } = useDeleteAlertRecipient();

  const [drafts, setDrafts] = useState<Record<EventType, string>>({
    preregistration: "",
    checkin: "",
    checkout: "",
    overdue: "",
  });
  const [addingType, setAddingType] = useState<EventType | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/alert-recipients"] });

  const handleAdd = async (type: EventType, e: React.FormEvent) => {
    e.preventDefault();
    const email = drafts[type].trim();
    if (!email) return;
    setAddingType(type);
    try {
      await createRecipient({ data: { eventType: type, email } });
      setDrafts((d) => ({ ...d, [type]: "" }));
      refresh();
      toast({ title: "Recipient added", description: `${email} will be alerted.` });
    } catch (err) {
      const s = (err as { status?: number } | null)?.status;
      toast({
        title: "Failed to add recipient",
        description: s === 409 ? "That address is already on this list." : "Check the email and try again.",
        variant: "destructive",
      });
    } finally {
      setAddingType(null);
    }
  };

  const handleDelete = async (id: number, email: string) => {
    setDeleting(id);
    try {
      await deleteRecipient({ id });
      refresh();
      toast({ title: "Recipient removed", description: `${email} will no longer be alerted.` });
    } catch {
      toast({ title: "Failed to remove recipient", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const byType = (type: EventType) => (recipients ?? []).filter((r) => r.eventType === type);

  const { data: autoCheckout, isLoading: autoLoading } = useGetAutoCheckoutSettings();
  const { mutateAsync: updateAutoCheckout, isPending: savingAuto } = useUpdateAutoCheckoutSettings();
  const [autoDraft, setAutoDraft] = useState<string | null>(null);
  const autoValue = autoDraft ?? autoCheckout?.time ?? "";

  const saveAutoCheckout = async (time: string | null) => {
    try {
      await updateAutoCheckout({ data: { time } });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/auto-checkout"] });
      setAutoDraft(null);
      toast({
        title: time ? "Auto check-out enabled" : "Auto check-out disabled",
        description: time
          ? `All on-site guests will be checked out automatically at ${time} each night.`
          : "Guests will no longer be checked out automatically.",
      });
    } catch {
      toast({ title: "Failed to save auto check-out setting", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Email Alerts
          </h2>
          <p className="text-muted-foreground">
            Configure who receives an email when each visitor event happens.
          </p>
        </div>

        {/* Delivery status banner */}
        {status && (
          <div
            className={`rounded-md border mb-6 p-4 flex items-start gap-3 ${
              status.emailConfigured
                ? "bg-primary/5 border-primary/30"
                : "bg-destructive/10 border-destructive/30"
            }`}
          >
            {status.emailConfigured ? (
              <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            )}
            <div className="text-sm">
              {status.emailConfigured ? (
                <>
                  <span className="font-medium text-foreground">Email delivery is active.</span>{" "}
                  <span className="text-muted-foreground">
                    Alerts are sent from{" "}
                    <span className="font-mono text-foreground">{status.fromEmail}</span>.
                  </span>
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">Email delivery is not configured.</span>{" "}
                  <span className="text-muted-foreground">
                    Recipients can be managed here, but no emails will be sent until the server has{" "}
                    <span className="font-mono">SENDGRID_API_KEY</span> and{" "}
                    <span className="font-mono">SENDGRID_FROM_EMAIL</span> set.
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Nightly auto check-out */}
        <div className="bg-card border border-border rounded-md overflow-hidden mb-6" data-testid="card-auto-checkout">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Nightly Auto Check-Out</h3>
              <span className="text-xs text-muted-foreground">
                {autoCheckout?.time ? `Runs daily at ${autoCheckout.time}` : "Disabled"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Automatically check out everyone still marked on site at a set time each night (server
              local time). Each auto check-out is recorded in the audit log.
            </p>
          </div>
          <div className="p-4">
            {autoLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (autoValue) void saveAutoCheckout(autoValue);
                }}
              >
                <Input
                  type="time"
                  value={autoValue}
                  onChange={(e) => setAutoDraft(e.target.value)}
                  className="h-9 w-36"
                  data-testid="input-auto-checkout-time"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 shrink-0"
                  disabled={savingAuto || !autoValue || autoValue === (autoCheckout?.time ?? "")}
                  data-testid="button-save-auto-checkout"
                >
                  {savingAuto && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
                {autoCheckout?.time && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={savingAuto}
                    onClick={() => void saveAutoCheckout(null)}
                    data-testid="button-disable-auto-checkout"
                  >
                    Disable
                  </Button>
                )}
              </form>
            )}
            {autoCheckout?.time && (
              <p className="text-xs text-muted-foreground mt-2">
                If you set a time that has already passed today, the first run happens tomorrow.
              </p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading alert settings...</div>
        ) : (
          <div className="space-y-4">
            {EVENT_SECTIONS.map((section) => {
              const list = byType(section.type);
              return (
                <div key={section.type} className="bg-card border border-border rounded-md overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      {section.type === "overdue" ? (
                        <MailWarning className="w-4 h-4 text-primary" />
                      ) : (
                        <Mail className="w-4 h-4 text-primary" />
                      )}
                      <h3 className="font-semibold">{section.label}</h3>
                      <span className="text-xs text-muted-foreground">
                        {list.length === 0 ? "No recipients — disabled" : `${list.length} recipient${list.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
                  </div>

                  <div className="p-4 space-y-3">
                    {list.length > 0 && (
                      <ul className="space-y-2">
                        {list.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center justify-between gap-3 bg-muted/40 rounded px-3 py-2 text-sm"
                          >
                            <span className="font-mono truncate">{r.email}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-muted-foreground hover:text-destructive shrink-0"
                              disabled={deleting === r.id}
                              onClick={() => handleDelete(r.id, r.email)}
                            >
                              {deleting === r.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <form onSubmit={(e) => handleAdd(section.type, e)} className="flex items-center gap-2">
                      <Input
                        type="email"
                        placeholder="name@example.com"
                        value={drafts[section.type]}
                        onChange={(e) => setDrafts((d) => ({ ...d, [section.type]: e.target.value }))}
                        className="h-9"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        className="h-9 shrink-0"
                        disabled={creating && addingType === section.type}
                      >
                        {creating && addingType === section.type && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Add
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
