import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useCreatePublicPreregistration, useListStudios } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PURPOSES } from "@/lib/purposes";
import { SITE_NAME, CLIENT_NAME, CLIENT_LOGO_URL } from "@/lib/site";
import { CheckCircle2, ArrowRight, ArrowLeft, Check, Clock, User, Building, Briefcase, UserCircle, Users, Send, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { z } from "zod";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clientLogoSrc = CLIENT_LOGO_URL || `${basePath}/logo.svg`;
const clientLabel = CLIENT_NAME || SITE_NAME;

const emailSchema = z.string().email().or(z.literal(""));

type FormData = {
  guestName: string;
  company: string;
  phone: string;
  email: string;
  registeredBy: string;
  hostName: string;
  hostEmail: string;
  hostPhone: string;
  purposeOfVisit: string;
  expectedArrival: string;
  expectedDeparture: string;
  studios: string[];
};

const initialForm: FormData = {
  guestName: "",
  company: "",
  phone: "",
  email: "",
  registeredBy: "",
  hostName: "",
  hostEmail: "",
  hostPhone: "",
  purposeOfVisit: "",
  expectedArrival: "",
  expectedDeparture: "",
  studios: [],
};

export default function Preregister() {
  const [form, setForm] = useState<FormData>(initialForm);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submittedData, setSubmittedData] = useState<{
    success: true;
    approvalStatus?: string;
    lateRegistration?: boolean;
    emailProvided?: boolean;
    guestName: string;
  } | null>(null);

  const { data: studioList } = useListStudios();
  const { mutateAsync: submitPreg, isPending } = useCreatePublicPreregistration();

  const handleNext = () => {
    setError(null);

    // Validation per step
    if (step === 1) {
      if (!form.registeredBy.trim()) {
        setError("Please enter your name first.");
        return;
      }
      if (!form.guestName.trim()) {
        setError("Please enter the visitor's full name.");
        return;
      }
      if (form.email && !emailSchema.safeParse(form.email).success) {
        setError("Please enter a valid email address for the visitor.");
        return;
      }
    } else if (step === 2) {
      if (!form.hostName.trim()) {
        setError("Please enter the name of the person being visited.");
        return;
      }
      if (form.hostEmail && !emailSchema.safeParse(form.hostEmail).success) {
        setError("Please enter a valid email address for the host.");
        return;
      }
    } else if (step === 3) {
      if (!form.expectedArrival) {
        setError("Please provide an expected arrival time.");
        return;
      }
    }

    setStep((s) => Math.min(s + 1, 4));
  };

  const handleBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.guestName || !form.hostName || !form.expectedArrival || !form.registeredBy) {
      setError("Please ensure all required fields are filled.");
      return;
    }

    try {
      const res = await submitPreg({
        data: {
          guestName: form.guestName.trim(),
          company: form.company.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          hostName: form.hostName.trim(),
          hostEmail: form.hostEmail.trim() || undefined,
          hostPhone: form.hostPhone.trim() || undefined,
          registeredBy: form.registeredBy.trim(),
          purposeOfVisit: form.purposeOfVisit || undefined,
          site: SITE_NAME,
          expectedArrival: new Date(form.expectedArrival).toISOString(),
          expectedDeparture: form.expectedDeparture ? new Date(form.expectedDeparture).toISOString() : undefined,
          studios: form.studios.length > 0 ? form.studios : undefined,
        },
      });

      setSubmittedData({
        success: true,
        approvalStatus: res.approvalStatus,
        lateRegistration: res.lateRegistration,
        emailProvided: !!form.email.trim(),
        guestName: form.guestName.trim(),
      });
    } catch {
      setError("Something went wrong submitting your registration. Please try again.");
    }
  };

  const isRegisteringSelf = form.registeredBy.trim() !== "" && form.registeredBy === form.guestName;

  const toggleRegisterSelf = () => {
    if (isRegisteringSelf) {
      setForm({ ...form, guestName: "" });
    } else {
      setForm({ ...form, guestName: form.registeredBy });
    }
  };

  const toggleStudio = (name: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      studios: checked ? [...f.studios, name] : f.studios.filter((s) => s !== name),
    }));
  };

  const slideVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  if (submittedData) {
    const isPending = submittedData.approvalStatus === "pending";
    return (
      <div className="dark min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-6 selection:bg-primary/30">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="max-w-md w-full text-center bg-card/50 backdrop-blur-xl border border-white/10 rounded-2xl p-8 sm:p-12 shadow-2xl"
        >
          <img src={clientLogoSrc} alt={clientLabel} className="max-h-12 w-auto max-w-[60%] mx-auto mb-8 opacity-90" />
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-serif mb-3 tracking-tight">Registration Complete</h1>
          
          <div className="text-muted-foreground mb-8 space-y-4 text-sm leading-relaxed">
            <p>
              Thank you, {submittedData.guestName.split(" ")[0]}. We've received the visitor details for {SITE_NAME}.
            </p>
            
            {isPending ? (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-orange-200">
                This visit requires approval. You'll receive an email as soon as it has been reviewed by the host.
              </div>
            ) : (
              <p>
                {submittedData.emailProvided 
                  ? "A fast-track QR code will be sent to the visitor's email shortly to speed up check-in at the security desk."
                  : "Please check in at the security desk upon arrival to receive a visitor badge."}
              </p>
            )}

            {submittedData.lateRegistration && (
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-4 text-amber-200 text-left flex gap-3" data-testid="banner-late-registration">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <p className="font-medium text-amber-100 mb-1">Late registration</p>
                  <p>
                    Your registration was submitted, but because it was made less than 4 hours before arrival, the guest will need additional screening at the security desk. Please allow extra time.
                  </p>
                </div>
              </div>
            )}
          </div>

          <Button
            size="lg"
            variant="outline"
            className="w-full bg-transparent border-white/20 hover:bg-white/5"
            onClick={() => {
              setSubmittedData(null);
              setForm(initialForm);
              setStep(1);
            }}
          >
            Register another visitor
          </Button>
        </motion.div>
      </div>
    );
  }

  const steps = [
    { num: 1, label: "Visitor" },
    { num: 2, label: "Host" },
    { num: 3, label: "Schedule" },
    { num: 4, label: "Review" },
  ];

  return (
    <div className="dark min-h-[100dvh] bg-background text-foreground flex flex-col selection:bg-primary/30">
      {/* Header */}
      <header className="w-full p-6 sm:p-8 flex items-center justify-between z-10 relative">
        <div className="flex items-center gap-4">
          <img src={clientLogoSrc} alt={clientLabel} className="max-h-10 w-auto" />
          <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
          <span className="text-sm text-muted-foreground font-medium tracking-wide hidden sm:block uppercase">Visitor Registration</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center px-6 pb-12 pt-4 sm:pt-12 w-full max-w-2xl mx-auto relative z-10">
        
        {/* Progress Indicator */}
        <div className="w-full mb-12">
          <div className="flex justify-between relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/10 -translate-y-1/2" />
            <div 
              className="absolute top-1/2 left-0 h-px bg-primary -translate-y-1/2 transition-all duration-500 ease-out" 
              style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
            />
            {steps.map((s) => {
              const isActive = step >= s.num;
              const isCurrent = step === s.num;
              return (
                <div key={s.num} className="relative flex flex-col items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300 z-10 ${isActive ? "bg-primary text-primary-foreground shadow-[0_0_15px_rgba(59,130,246,0.3)]" : "bg-card border border-white/10 text-muted-foreground"}`}>
                    {step > s.num ? <Check className="w-4 h-4" /> : s.num}
                  </div>
                  <span className={`text-xs absolute -bottom-6 whitespace-nowrap transition-colors duration-300 ${isCurrent ? "text-foreground font-medium" : "text-muted-foreground/60"}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Container */}
        <div className="w-full bg-card border border-white/5 shadow-2xl rounded-2xl p-6 sm:p-10 relative overflow-hidden">
          {/* Subtle decorative glow */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          
          <AnimatePresence mode="wait" custom={step}>
            <motion.div
              key={step}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full"
            >
              {error && (
                <div className="mb-6 text-sm text-red-200 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
                  <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  {error}
                </div>
              )}

              {/* STEP 1: VISITOR */}
              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif mb-2">Visitor Details</h2>
                    <p className="text-muted-foreground text-sm">Let's start with you — then tell us who is visiting {clientLabel}.</p>
                  </div>
                  
                  <div className="space-y-5 mt-8">
                    <div>
                      <Label htmlFor="registeredBy" className="text-muted-foreground">Your Name *</Label>
                      <div className="relative mt-2">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                        <Input 
                          id="registeredBy" 
                          data-testid="input-registered-by"
                          value={form.registeredBy} 
                          onChange={(e) => setForm({ ...form, registeredBy: e.target.value })} 
                          className="pl-10 h-12 bg-white/5 border-white/10 text-base"
                          placeholder="Jane Doe" 
                        />
                      </div>
                      <p className="text-xs text-muted-foreground/60 mt-2">The person filling out this form.</p>
                    </div>

                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="guestName" className="text-muted-foreground">Visitor's Full Name *</Label>
                        {form.registeredBy.trim().length > 0 && (
                          <button 
                            type="button" 
                            onClick={toggleRegisterSelf}
                            className="text-xs text-primary hover:text-primary/80 transition-colors"
                            data-testid="button-registering-self"
                          >
                            {isRegisteringSelf ? "Clear" : "I'm the visitor"}
                          </button>
                        )}
                      </div>
                      <Input 
                        id="guestName" 
                        data-testid="input-guest-name"
                        value={form.guestName} 
                        onChange={(e) => setForm({ ...form, guestName: e.target.value })} 
                        className="h-11 bg-white/5 border-white/10"
                        placeholder="Who is visiting?" 
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <Label htmlFor="company" className="text-muted-foreground">Company</Label>
                        <Input 
                          id="company" 
                          value={form.company} 
                          onChange={(e) => setForm({ ...form, company: e.target.value })} 
                          className="mt-2 h-11 bg-white/5 border-white/10"
                          placeholder="Organization" 
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone" className="text-muted-foreground">Phone</Label>
                        <Input 
                          id="phone" 
                          type="tel"
                          value={form.phone} 
                          onChange={(e) => setForm({ ...form, phone: e.target.value })} 
                          className="mt-2 h-11 bg-white/5 border-white/10"
                          placeholder="(555) 000-0000" 
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="email" className="text-muted-foreground">Email</Label>
                      <Input 
                        id="email" 
                        type="email"
                        value={form.email} 
                        onChange={(e) => setForm({ ...form, email: e.target.value })} 
                        className="mt-2 h-11 bg-white/5 border-white/10"
                        placeholder="visitor@example.com" 
                      />
                      <p className="text-xs text-muted-foreground/60 mt-2">Required if you want them to receive a fast-track QR code.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: HOST & PURPOSE */}
              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif mb-2">Host & Purpose</h2>
                    <p className="text-muted-foreground text-sm">Who are they meeting, and why?</p>
                  </div>
                  
                  <div className="space-y-5 mt-8">
                    <div>
                      <Label htmlFor="hostName" className="text-muted-foreground">Host Name *</Label>
                      <div className="relative mt-2">
                        <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                        <Input 
                          id="hostName" 
                          value={form.hostName} 
                          onChange={(e) => setForm({ ...form, hostName: e.target.value })} 
                          className="pl-10 h-12 bg-white/5 border-white/10 text-base"
                          placeholder="Employee / Contact name" 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <Label htmlFor="hostEmail" className="text-muted-foreground">Host Email</Label>
                        <Input 
                          id="hostEmail" 
                          type="email"
                          data-testid="input-host-email"
                          value={form.hostEmail} 
                          onChange={(e) => setForm({ ...form, hostEmail: e.target.value })} 
                          className="mt-2 h-11 bg-white/5 border-white/10"
                          placeholder="host@example.com" 
                        />
                      </div>
                      <div>
                        <Label htmlFor="hostPhone" className="text-muted-foreground">Host Phone</Label>
                        <Input 
                          id="hostPhone" 
                          type="tel"
                          data-testid="input-host-phone"
                          value={form.hostPhone} 
                          onChange={(e) => setForm({ ...form, hostPhone: e.target.value })} 
                          className="mt-2 h-11 bg-white/5 border-white/10"
                          placeholder="(555) 000-0000" 
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="purpose" className="text-muted-foreground">Purpose of Visit</Label>
                      <Select value={form.purposeOfVisit} onValueChange={(v) => setForm({ ...form, purposeOfVisit: v })}>
                        <SelectTrigger id="purpose" data-testid="select-purpose" className="mt-2 h-11 bg-white/5 border-white/10">
                          <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                        <SelectContent className="bg-card/95 backdrop-blur-xl border-white/10">
                          {PURPOSES.map((p) => <SelectItem key={p} value={p} className="focus:bg-white/10">{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {(studioList?.length ?? 0) > 0 && (
                      <div className="pt-2">
                        <Label className="text-muted-foreground">Studios (Optional)</Label>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {studioList?.map((s) => (
                            <label 
                              key={s.id} 
                              className={`flex items-center gap-3 cursor-pointer rounded-xl border p-4 transition-colors ${form.studios.includes(s.name) ? "bg-primary/10 border-primary/30" : "bg-white/5 border-white/5 hover:border-white/10"}`}
                            >
                              <Checkbox
                                checked={form.studios.includes(s.name)}
                                onCheckedChange={(c) => toggleStudio(s.name, c === true)}
                                className="border-white/20 data-[state=checked]:bg-primary"
                              />
                              <span className="text-sm font-medium">{s.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: SCHEDULE */}
              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif mb-2">Schedule</h2>
                    <p className="text-muted-foreground text-sm">When should we expect them?</p>
                  </div>
                  
                  <div className="space-y-6 mt-8">
                    <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                      <Label htmlFor="arrival" className="text-foreground text-base">Expected Arrival *</Label>
                      <Input 
                        id="arrival" 
                        type="datetime-local" 
                        value={form.expectedArrival} 
                        onChange={(e) => setForm({ ...form, expectedArrival: e.target.value })} 
                        className="h-12 bg-white/5 border-white/10 text-base"
                      />
                    </div>

                    <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                      <Label htmlFor="departure" className="text-foreground text-base">Expected Departure (Optional)</Label>
                      <Input 
                        id="departure" 
                        type="datetime-local" 
                        value={form.expectedDeparture} 
                        onChange={(e) => setForm({ ...form, expectedDeparture: e.target.value })} 
                        className="h-12 bg-white/5 border-white/10 text-base"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: REVIEW */}
              {step === 4 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif mb-2">Review Details</h2>
                    <p className="text-muted-foreground text-sm">Please verify the information before submitting.</p>
                  </div>
                  
                  <div className="mt-8 space-y-4 text-sm">
                    {/* Visitor Card */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl"></div>
                      <div className="flex items-center gap-3 text-primary mb-4">
                        <User className="w-4 h-4" />
                        <h3 className="font-medium">Visitor Information</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-muted-foreground">
                        <div>
                          <span className="block text-xs opacity-60 mb-0.5">Name</span>
                          <span className="text-foreground">{form.guestName}</span>
                        </div>
                        <div>
                          <span className="block text-xs opacity-60 mb-0.5">Registered By</span>
                          <span className="text-foreground">{form.registeredBy}</span>
                        </div>
                        {form.company && (
                          <div>
                            <span className="block text-xs opacity-60 mb-0.5">Company</span>
                            <span className="text-foreground">{form.company}</span>
                          </div>
                        )}
                        {form.email && (
                          <div>
                            <span className="block text-xs opacity-60 mb-0.5">Email</span>
                            <span className="text-foreground">{form.email}</span>
                          </div>
                        )}
                        {form.phone && (
                          <div>
                            <span className="block text-xs opacity-60 mb-0.5">Phone</span>
                            <span className="text-foreground">{form.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Host Card */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 relative overflow-hidden">
                      <div className="flex items-center gap-3 text-primary mb-4">
                        <Briefcase className="w-4 h-4" />
                        <h3 className="font-medium">Visit Details</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-muted-foreground">
                        <div>
                          <span className="block text-xs opacity-60 mb-0.5">Host Name</span>
                          <span className="text-foreground">{form.hostName}</span>
                        </div>
                        {form.purposeOfVisit && (
                          <div>
                            <span className="block text-xs opacity-60 mb-0.5">Purpose</span>
                            <span className="text-foreground">{form.purposeOfVisit}</span>
                          </div>
                        )}
                        {form.hostEmail && (
                          <div>
                            <span className="block text-xs opacity-60 mb-0.5">Host Email</span>
                            <span className="text-foreground">{form.hostEmail}</span>
                          </div>
                        )}
                        {form.studios.length > 0 && (
                          <div className="col-span-2">
                            <span className="block text-xs opacity-60 mb-0.5">Studios</span>
                            <span className="text-foreground">{form.studios.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Schedule Card */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 relative overflow-hidden">
                      <div className="flex items-center gap-3 text-primary mb-4">
                        <Clock className="w-4 h-4" />
                        <h3 className="font-medium">Timing</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-muted-foreground">
                        <div>
                          <span className="block text-xs opacity-60 mb-0.5">Arrival</span>
                          <span className="text-foreground">{form.expectedArrival ? format(new Date(form.expectedArrival), "PP p") : "-"}</span>
                        </div>
                        {form.expectedDeparture && (
                          <div>
                            <span className="block text-xs opacity-60 mb-0.5">Departure</span>
                            <span className="text-foreground">{format(new Date(form.expectedDeparture), "PP p")}</span>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  <p className="text-xs text-muted-foreground/60 text-center mt-6">
                    By submitting, you agree to our facility security and visit management terms. See our{" "}
                    <Link href="/privacy" className="underline hover:text-foreground transition-colors" data-testid="link-privacy-preregister">
                      Privacy Notice
                    </Link>.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="mt-10 pt-6 border-t border-white/10 flex items-center justify-between">
            {step > 1 ? (
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-white/5" onClick={handleBack} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            ) : (
              <div /> // Placeholder to push Next to right
            )}

            {step < steps.length ? (
              <Button onClick={handleNext} className="min-w-[120px]" data-testid="button-next">
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={isPending} className="min-w-[140px] bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(59,130,246,0.3)]" data-testid="button-submit">
                {isPending ? "Submitting..." : (
                  <>
                    Submit Registration
                    <Send className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
