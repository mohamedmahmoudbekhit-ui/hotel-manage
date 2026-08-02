import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth-shell";
import { PasswordFields } from "@/components/password-fields";
import { isPasswordValid, passwordError } from "@/lib/auth/password";
import { recordPasswordResetCompleted } from "@/lib/auth/account.functions";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Hotel Management" },
      { name: "description", content: "Choose a new password for your Hotel Management account." },
      { property: "og:title", content: "Reset password — Hotel Management" },
      { property: "og:description", content: "Choose a new password for your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const audit = useServerFn(recordPasswordResetCompleted);
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // The recovery link hydrates a session asynchronously.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (cancelled) return;
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          if (!cancelled) {
            setEmail(data.user.email ?? "");
            setReady(true);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled) setInvalid(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = passwordError(password);
    if (err) return toast.error(err);
    if (password !== confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      try {
        await audit({ data: { email } });
      } catch {
        /* audit is best-effort */
      }
      // Invalidate every existing session, then send the user back to sign in.
      await supabase.auth.signOut({ scope: "global" });
      navigate({ to: "/login", search: { reset: "1" }, replace: true });
    } catch (err2) {
      toast.error(err2 instanceof Error ? err2.message : "Failed to update password");
    } finally {
      setBusy(false);
    }
  };

  if (invalid) {
    return (
      <AuthShell>
        <h1 className="text-xl font-bold">Link expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This reset link is invalid, already used, or older than 1 hour. Request a new one to continue.
        </p>
        <Button asChild className="mt-5 w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthShell>
    );
  }

  if (!ready) {
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
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" /> {email}
      </div>
      <h1 className="text-xl font-bold">Choose a new password</h1>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <PasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          label="New password"
        />
        <Button type="submit" className="w-full" disabled={busy || !isPasswordValid(password) || password !== confirm}>
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
