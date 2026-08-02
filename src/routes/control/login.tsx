import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { regenerateRecoveryCodes, redeemRecoveryCode } from "@/lib/admin/mfa.functions";
import { sendConsolePasswordLink } from "@/lib/admin/console-password.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2, KeyRound, Copy, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/control/login")({
  component: ConsoleLogin,
});

type Step = "credentials" | "enroll" | "challenge" | "recovery" | "codes" | "forgot";

function ConsoleLogin() {
  const navigate = useNavigate();
  const genCodes = useServerFn(regenerateRecoveryCodes);
  const redeem = useServerFn(redeemRecoveryCode);
  const sendPasswordLink = useServerFn(sendConsolePasswordLink);

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]);

  // Already fully authenticated at AAL2? Go straight in.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.currentLevel === "aal2") navigate({ to: "/control", replace: true });
    })();
  }, [navigate]);

  const reject = async (message: string) => {
    await supabase.auth.signOut();
    setPassword("");
    toast.error(message);
  };

  const startEnrollment = async () => {
    // Clear stale unverified factors so enrollment always succeeds.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
    if (error) throw error;
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStep("enroll");
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Invalid credentials");

      const { data: isSuperAdmin } = await supabase.rpc("ensure_super_admin_self");
      if (isSuperAdmin !== true) {
        await reject("Invalid credentials");
        return;
      }

      const { data: list } = await supabase.auth.mfa.listFactors();
      const verified = (list?.totp ?? []).find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setPassword("");
        setStep("challenge");
      } else {
        setPassword("");
        await startEnrollment();
      }
    } catch (err) {
      await reject(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (afterEnroll: boolean) => {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.replace(/\s/g, ""),
    });
    if (error) throw new Error("Invalid verification code");
    setCode("");
    if (afterEnroll) {
      const result = await genCodes({ data: undefined } as never);
      setCodes(result.codes);
      setStep("codes");
    } else {
      navigate({ to: "/control", replace: true });
    }
  };

  const submitCode = (afterEnroll: boolean) => async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await verifyCode(afterEnroll);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await redeem({ data: { code } });
      setCode("");
      toast.success("Recovery code accepted. Set up a new authenticator.");
      await startEnrollment();
    } catch {
      toast.error("Invalid or already used recovery code");
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await sendPasswordLink({
        data: { email, redirectTo: `${window.location.origin}/admin/set-password` },
      });
    } finally {
      setBusy(false);
    }
    toast.success("If this address is authorized, a link is on its way.");
    setStep("credentials");
  };



  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2 text-neutral-100">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-neutral-100 text-neutral-950">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold">Platform Console</div>
            <div className="text-xs text-neutral-400">Authorized personnel only</div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-2xl">
          {step === "credentials" && (
            <form onSubmit={handleCredentials} className="space-y-3">
              <h1 className="text-xl font-bold">Sign in</h1>
              <p className="text-sm text-neutral-400">
                Administrator credentials and a second factor are required.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="bg-neutral-950" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="bg-neutral-950" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />} Continue
              </Button>
              <button type="button" onClick={() => setStep("forgot")} className="flex w-full items-center justify-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-100">
                <KeyRound className="h-3.5 w-3.5" /> First time here? Set your password
              </button>
            </form>
          )}

          {step === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-3">
              <h1 className="text-xl font-bold">Set your password</h1>
              <p className="text-sm text-neutral-400">
                We will email a secure one-time link to authorized administrators.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Email</Label>
                <Input id="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="bg-neutral-950" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />} Send link
              </Button>
              <button type="button" onClick={() => setStep("credentials")} className="flex w-full items-center justify-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-100">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </button>
            </form>
          )}

          {step === "enroll" && (
            <form onSubmit={submitCode(true)} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold">Set up your authenticator</h1>
                <p className="mt-1 text-sm text-neutral-400">
                  Scan this code with Google Authenticator, Microsoft Authenticator, or any TOTP app.
                </p>
              </div>
              {qr && (
                <div className="flex justify-center rounded-xl bg-white p-3">
                  <img src={qr} alt="Authenticator setup QR code" className="h-44 w-44" />
                </div>
              )}
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-center">
                <div className="text-[11px] uppercase tracking-wide text-neutral-500">Manual key</div>
                <code className="text-xs break-all">{secret}</code>
              </div>
              <CodeField value={code} onChange={setCode} />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />} Verify and continue
              </Button>
            </form>
          )}

          {step === "challenge" && (
            <form onSubmit={submitCode(false)} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold">Two-factor verification</h1>
                <p className="mt-1 text-sm text-neutral-400">Enter the 6-digit code from your authenticator app.</p>
              </div>
              <CodeField value={code} onChange={setCode} />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />} Verify
              </Button>
              <button type="button" onClick={() => { setCode(""); setStep("recovery"); }} className="flex w-full items-center justify-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-100">
                <KeyRound className="h-3.5 w-3.5" /> Use a backup recovery code
              </button>
            </form>
          )}

          {step === "recovery" && (
            <form onSubmit={handleRecovery} className="space-y-4">
              <div>
                <h1 className="text-xl font-bold">Backup recovery code</h1>
                <p className="mt-1 text-sm text-neutral-400">
                  Using a code removes your current authenticator so you can enroll a new device.
                </p>
              </div>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" required className="bg-neutral-950 text-center tracking-widest uppercase" />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />} Use recovery code
              </Button>
              <button type="button" onClick={() => { setCode(""); setStep("challenge"); }} className="flex w-full items-center justify-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-100">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to authenticator
              </button>
            </form>
          )}

          {step === "codes" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold">Save your recovery codes</h1>
                <p className="mt-1 text-sm text-neutral-400">
                  Each code works once if you lose your authenticator. They are shown only now.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs">
                {codes.map((c) => <div key={c}>{c}</div>)}
              </div>
              <Button variant="secondary" className="w-full gap-2" onClick={() => { navigator.clipboard.writeText(codes.join("\n")); toast.success("Copied"); }}>
                <Copy className="h-4 w-4" /> Copy codes
              </Button>
              <Button className="w-full" onClick={() => navigate({ to: "/control", replace: true })}>
                I saved them — enter console
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="totp">Verification code</Label>
      <Input
        id="totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="000000"
        className="bg-neutral-950 text-center text-lg tracking-[0.4em]"
      />
    </div>
  );
}
