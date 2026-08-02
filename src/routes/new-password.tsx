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
import { passwordError } from "@/lib/auth/password";
import { lookupResetToken, completeManualPasswordReset, type ResetTokenInfo } from "@/lib/auth/reset-requests.functions";

const searchSchema = z.object({ token: z.string().optional() });

const REASONS: Record<string, string> = {
  not_found: "This reset link is not valid.",
  already_used: "This reset link has already been used. Request a new one from your administrator.",
  expired: "This reset link has expired. Reset links are valid for 1 hour.",
};

export const Route = createFileRoute("/new-password")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Choose a new password — Hotel Management" },
      { name: "description", content: "Set a new password for your Hotel Management account using your secure reset link." },
      { property: "og:title", content: "Choose a new password — Hotel Management" },
      { property: "og:description", content: "Set a new password using your secure reset link." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewPassword,
});

function NewPassword() {
  const { token } = useSearch({ from: "/new-password" });
  const navigate = useNavigate();
  const lookup = useServerFn(lookupResetToken);
  const complete = useServerFn(completeManualPasswordReset);

  const [info, setInfo] = useState<ResetTokenInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    lookup({ data: { token } })
      .then(setInfo)
      .catch(() => setInfo({ valid: false, reason: "not_found" }));
  }, [token, lookup]);

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => navigate({ to: "/login", search: { reset: "1" }, replace: true }), 2500);
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
      await complete({ data: { token, password } });
      setDone(true);
    } catch (err2) {
      toast.error(err2 instanceof Error ? err2.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  };

  if (!token || (info && !info.valid)) {
    return (
      <AuthShell>
        <h1 className="text-xl font-bold">Link not usable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {info?.reason ? REASONS[info.reason] : "This reset link is not valid."}
        </p>
        <Button asChild className="mt-5 w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-xl font-bold">Password updated</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You've been signed out everywhere. Taking you to the sign-in page…
          </p>
          <Button asChild className="mt-5 w-full">
            <Link to="/login" search={{ reset: "1" }}>Go to sign in</Link>
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

  return (
    <AuthShell>
      <h1 className="text-xl font-bold">Choose a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">This link works once and expires 1 hour after it was issued.</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={info.email ?? ""} readOnly disabled />
        </div>
        <PasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          label="New password"
        />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
