import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { PasswordFields } from "@/components/password-fields";
import { isPasswordValid, passwordError } from "@/lib/auth/password";
import { lookupActivation, activateAccount, type ActivationInfo } from "@/lib/auth/account.functions";

const searchSchema = z.object({ token: z.string().optional() });

const REASONS: Record<string, string> = {
  not_found: "This activation link is not valid.",
  already_used: "This activation link has already been used. Sign in with your password instead.",
  expired: "This activation link has expired. Activation links are valid for 24 hours.",
  error: "We couldn't verify this activation link.",
};

export const Route = createFileRoute("/activate")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Activate your account — Hotel Management" },
      { name: "description", content: "Set your password and activate your Hotel Management owner account." },
      { property: "og:title", content: "Activate your account — Hotel Management" },
      { property: "og:description", content: "Set your password and activate your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Activate,
});

function Activate() {
  const { token } = useSearch({ from: "/activate" });
  const navigate = useNavigate();
  const lookup = useServerFn(lookupActivation);
  const activate = useServerFn(activateAccount);

  const [info, setInfo] = useState<ActivationInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    lookup({ data: { token } })
      .then(setInfo)
      .catch(() => setInfo({ valid: false, reason: "error" }));
  }, [token, lookup]);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => navigate({ to: "/login", search: { joined: "1" }, replace: true }), 2500);
    return () => clearTimeout(id);
  }, [done, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const err = passwordError(password);
    if (err) return toast.error(err);
    if (password !== confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      await activate({ data: { token, password } });
      setDone(true);
    } catch (err2) {
      toast.error(err2 instanceof Error ? err2.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell>
        <h1 className="text-xl font-bold">Missing activation token</h1>
        <p className="mt-2 text-sm text-muted-foreground">Open the activation link from your invitation email.</p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <h1 className="mt-3 text-xl font-bold">Account activated</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your password is set and your account is now active. Redirecting you to sign in…
          </p>
          <Button asChild className="mt-5 w-full">
            <Link to="/login" search={{ joined: "1" }}>Go to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (!info) {
    return (
      <AuthShell>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthShell>
    );
  }

  if (!info.valid) {
    return (
      <AuthShell>
        <h1 className="text-xl font-bold">Link unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">{REASONS[info.reason ?? "error"]}</p>
        <Button asChild variant="outline" className="mt-5 w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <p className="text-sm text-muted-foreground">Welcome to</p>
      <h1 className="text-xl font-bold">{info.hotelName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your password to activate your owner account. This link expires 24 hours after it was issued.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={info.email ?? ""} readOnly disabled />
        </div>
        <PasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        <Button type="submit" className="w-full" disabled={busy || !isPasswordValid(password) || password !== confirm}>
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          Set your password
        </Button>
      </form>
    </AuthShell>
  );
}
