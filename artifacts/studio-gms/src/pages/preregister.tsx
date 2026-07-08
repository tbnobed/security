import { useState } from "react";
import { Link } from "wouter";
import { useCreatePublicPreregistration, useListStudios } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SITE_NAME, CLIENT_NAME, CLIENT_LOGO_URL } from "@/lib/site";
import { CheckCircle2, ClipboardCheck } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clientLogoSrc = CLIENT_LOGO_URL || `${basePath}/logo.svg`;
const clientLabel = CLIENT_NAME || SITE_NAME;

export default function Preregister() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    guestName: "", company: "", phone: "", email: "",
    hostName: "", purposeOfVisit: "",
    expectedArrival: "", expectedDeparture: "",
  });
  const [studios, setStudios] = useState<string[]>([]);

  const { data: studioList } = useListStudios();
  const { mutateAsync: submitPreg, isPending } = useCreatePublicPreregistration();

  const toggleStudio = (name: string, checked: boolean) => {
    setStudios((prev) => (checked ? [...prev, name] : prev.filter((s) => s !== name)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.guestName || !form.hostName || !form.expectedArrival) {
      setError("Please fill in your name, who you're visiting, and your expected arrival time.");
      return;
    }
    try {
      await submitPreg({
        data: {
          guestName: form.guestName,
          company: form.company || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          hostName: form.hostName,
          purposeOfVisit: form.purposeOfVisit || undefined,
          site: SITE_NAME,
          expectedArrival: new Date(form.expectedArrival).toISOString(),
          expectedDeparture: form.expectedDeparture
            ? new Date(form.expectedDeparture).toISOString()
            : undefined,
          studios,
        },
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong submitting your registration. Please try again.");
    }
  };

  if (submitted) {
    return (
      <div className="dark min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-card border border-border rounded-md p-8">
          <img src={clientLogoSrc} alt={clientLabel} className="max-h-12 w-auto max-w-[60%] mx-auto mb-6" />
          <CheckCircle2 className="w-14 h-14 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">You're pre-registered</h1>
          <p className="text-muted-foreground mb-6">
            Thanks, {form.guestName.split(" ")[0]}. Please check in at the security desk when you
            arrive at {SITE_NAME} and a badge will be issued for you.
          </p>
          <Button
            onClick={() => {
              setSubmitted(false);
              setForm({ guestName: "", company: "", phone: "", email: "", hostName: "", purposeOfVisit: "", expectedArrival: "", expectedDeparture: "" });
              setStudios([]);
            }}
          >
            Register another visitor
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="flex flex-col items-center text-center gap-4 mb-8">
          <img src={clientLogoSrc} alt={clientLabel} className="max-h-16 w-auto max-w-[70%]" />
          <div>
            <h1 className="text-xl font-bold tracking-wide text-primary">Visitor Pre-Registration</h1>
            <p className="text-sm text-muted-foreground">{clientLabel}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-md p-6">
          <p className="text-sm text-muted-foreground flex items-start gap-2">
            <ClipboardCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            Fill this out ahead of your visit to speed up check-in at the security desk.
          </p>
          <p className="text-xs text-muted-foreground">
            Your information is collected for facility security and visit management. See our{" "}
            <Link href="/privacy" className="underline underline-offset-2" data-testid="link-privacy-preregister">
              Privacy Notice
            </Link>
            .
          </p>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/40 rounded-md p-3">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="guestName">Full Name *</Label>
              <Input id="guestName" className="mt-1" value={form.guestName} onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))} placeholder="First Last" required />
            </div>
            <div>
              <Label htmlFor="company">Company</Label>
              <Input id="company" className="mt-1" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Organization" />
            </div>
            <div>
              <Label htmlFor="hostName">Who are you visiting? *</Label>
              <Input id="hostName" className="mt-1" value={form.hostName} onChange={(e) => setForm((f) => ({ ...f, hostName: e.target.value }))} placeholder="Host / employee name" required />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" className="mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="555-000-0000" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" className="mt-1" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="purpose">Purpose of Visit</Label>
              <Input id="purpose" className="mt-1" value={form.purposeOfVisit} onChange={(e) => setForm((f) => ({ ...f, purposeOfVisit: e.target.value }))} placeholder="e.g. Production meeting" />
            </div>
            <div>
              <Label htmlFor="arrival">Expected Arrival *</Label>
              <Input id="arrival" type="datetime-local" className="mt-1" value={form.expectedArrival} onChange={(e) => setForm((f) => ({ ...f, expectedArrival: e.target.value }))} required />
            </div>
            <div>
              <Label htmlFor="departure">Expected Departure</Label>
              <Input id="departure" type="datetime-local" className="mt-1" value={form.expectedDeparture} onChange={(e) => setForm((f) => ({ ...f, expectedDeparture: e.target.value }))} />
            </div>
          </div>

          {(studioList?.length ?? 0) > 0 && (
            <div>
              <Label>Studios you'll be visiting</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {studioList?.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-border px-3 py-2 hover:bg-muted/50">
                    <Checkbox
                      checked={studios.includes(s.name)}
                      onCheckedChange={(c) => toggleStudio(s.name, c === true)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Submitting..." : "Submit Pre-Registration"}
          </Button>
        </form>
      </div>
    </div>
  );
}
