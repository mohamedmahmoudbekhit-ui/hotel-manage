import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hotel, Loader2, CheckCircle2, ShieldCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

const searchSchema = z.object({ joined: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Sign in — Hotel Management" },
      { name: "description", content: "Sign in to your Hotel Management account. Access is invitation only." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, toggle, lang, dir } = useI18n();
  const navigate = useNavigate();
  const { joined } = useSearch({ from: "/auth" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"credentials" | "verify">("credentials");
  const [code, setCode] = useState("");
  const [resending, setResending] = useState(false);
  // While a second factor is pending we must not auto-navigate on the
  // transient password session.
  const holdNav = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !holdNav.current) navigate({ to: "/", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (holdNav.current) return;
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        navigate({ to: "/", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const sendCode = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) throw error;
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    holdNav.current = true;
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Determine whether this account is a super admin (extra factor required).
      const { data: isSuperAdmin } = await supabase.rpc("ensure_super_admin_self");

      if (isSuperAdmin) {
        // Drop the password-only session, then require an emailed code.
        await supabase.auth.signOut();
        await sendCode();
        setPassword("");
        setStep("verify");
        toast.success("We emailed you a verification code.");
      } else {
        holdNav.current = false;
        navigate({ to: "/", replace: true });
      }
    } catch (err) {
      holdNav.current = false;
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
      if (error) throw error;
      holdNav.current = false;
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid or expired code");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await sendCode();
      toast.success("A new code is on its way.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend");
    } finally {
      setResending(false);
    }
  };

  const backToCredentials = () => {
    holdNav.current = false;
    setStep("credentials");
    setCode("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4 py-8" dir={dir}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Hotel className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-bold">{t("brand.name")}</div>
              <div className="text-xs text-muted-foreground">{t("brand.tagline")}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={toggle} className="text-xs font-semibold uppercase">
            {lang === "en" ? "AR" : "EN"}
          </Button>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-lg">
          {step === "credentials" ? (
            <>
              {joined && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 p-3 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Your account is ready. Sign in with your email and password.
                </div>
              )}
              <h1 className="text-xl font-bold">{t("auth.signInTitle")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

              <form onSubmit={handleEmail} className="mt-5 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t("auth.signIn")}
                </Button>
              </form>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Access is invitation only. Ask your administrator for an invitation link.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">Verify it&apos;s you</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                For extra security we sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. Enter it to finish signing in.
              </p>

              <form onSubmit={handleVerify} className="mt-5 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="code">Verification code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    minLength={6}
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="text-center text-lg tracking-[0.4em]"
                    placeholder="000000"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  Verify and sign in
                </Button>
              </form>

              <div className="mt-4 flex items-center justify-between text-xs">
                <button type="button" onClick={backToCredentials} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button type="button" onClick={handleResend} disabled={resending} className="text-primary hover:underline disabled:opacity-50">
                  {resending ? "Sending…" : "Resend code"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
