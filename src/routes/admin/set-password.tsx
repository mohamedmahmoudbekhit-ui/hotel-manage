import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/set-password")({
  ssr: false,
  component: SetPassword,
});

function SetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // The recovery link hydrates a session asynchronously; only allow the form
  // once we can confirm the session belongs to a platform administrator.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return false;
      const { data: isSuperAdmin } = await supabase.rpc("ensure_super_admin_self");
      if (isSuperAdmin !== true) {
        await supabase.auth.signOut();
        return false;
      }
      return true;
    };

    (async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (cancelled) return;
        if (await check()) {
          if (!cancelled) setReady(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled) {
        toast.error("This link is invalid or has expired.");
        navigate({ to: "/admin/login", replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      toast.error("Use at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      toast.success("Password set. Sign in to continue.");
      navigate({ to: "/admin/login", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set the password");
    } finally {
      setBusy(false);
    }
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
            <div className="text-xs text-neutral-400">Set your password</div>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-2xl">
          {!ready ? (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Verifying your link…
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <h1 className="text-xl font-bold">Choose a password</h1>
              <p className="text-sm text-neutral-400">
                After saving you will sign in again and set up your authenticator app.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-neutral-950" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="bg-neutral-950" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />} Save password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
