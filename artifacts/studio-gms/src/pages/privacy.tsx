import { Button } from "@/components/ui/button";
import { SITE_NAME, CLIENT_NAME, CLIENT_LOGO_URL, PRIVACY_CONTACT, PRIVACY_RETENTION } from "@/lib/site";
import { ShieldCheck, ArrowLeft } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clientLogoSrc = CLIENT_LOGO_URL || `${basePath}/logo.svg`;
const clientLabel = CLIENT_NAME || SITE_NAME;

const LAST_UPDATED = "July 8, 2026";

export default function PrivacyPage() {
  const contact = PRIVACY_CONTACT || `the security desk at ${SITE_NAME}`;
  const retention = PRIVACY_RETENTION ||
    "Visitor records are retained only as long as needed for facility security, safety, and audit purposes, and are then deleted.";

  return (
    <div className="dark min-h-screen bg-background text-foreground flex justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="flex flex-col items-center text-center gap-4 mb-8">
          <img src={clientLogoSrc} alt={clientLabel} className="max-h-14 w-auto max-w-[60%]" />
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-primary flex items-center justify-center gap-2">
              <ShieldCheck className="w-6 h-6" /> Visitor Privacy Notice
            </h1>
            <p className="text-sm text-muted-foreground">
              {clientLabel} — {SITE_NAME}
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-md p-6 space-y-6 text-sm leading-relaxed" data-testid="privacy-content">
          <p className="text-muted-foreground">
            This notice explains what personal information we collect from visitors to {SITE_NAME},
            why we collect it, and the choices you have. It is provided at or before the point of
            collection in accordance with the California Consumer Privacy Act (CCPA/CPRA).
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">What we collect</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Your name and, optionally, your company, phone number, and email address</li>
              <li>The name of the person you are visiting and the purpose of your visit</li>
              <li>The studios or areas you are visiting, and your check-in and check-out times</li>
              <li>An optional photo taken at check-in, used only for your visitor badge and identification while on site</li>
            </ul>
            <p className="text-muted-foreground">
              If you present a driver's license for scanning, the barcode is processed entirely on
              the scanning device and <strong>only your name</strong> is extracted — your license
              number, date of birth, address, and other license data are never retained,
              transmitted, or stored.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Why we collect it</h2>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Facility security and access control</li>
              <li>Knowing who is on site in case of an emergency or evacuation</li>
              <li>Issuing visitor badges</li>
              <li>Maintaining a security audit record of facility visits</li>
            </ul>
            <p className="text-muted-foreground">
              We collect only what is needed for these purposes and do not use visitor information
              for marketing.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">How it is stored and shared</h2>
            <p className="text-muted-foreground">
              Visitor records are stored on our own systems, operated by or on behalf of the
              facility. We do <strong>not</strong> sell or share your personal information for
              advertising or cross-context behavioral purposes. Information may be shared with
              facility security personnel, the person hosting your visit, and — where required —
              law enforcement or as otherwise required by law. Email notifications about visits may
              be sent to designated facility staff.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">How long we keep it</h2>
            <p className="text-muted-foreground">{retention}</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Your rights</h2>
            <p className="text-muted-foreground">
              California residents have the right to know what personal information we collect, to
              request access to it, to request correction or deletion (subject to security and
              legal record-keeping exceptions), and to not be discriminated against for exercising
              these rights. To make a request, contact {contact}.
            </p>
          </section>

          <p className="text-xs text-muted-foreground border-t border-border pt-4">
            Last updated: {LAST_UPDATED}. This notice may be updated from time to time; the current
            version is always available at this page.
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => window.history.back()} data-testid="privacy-back">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
        </div>
      </div>
    </div>
  );
}
