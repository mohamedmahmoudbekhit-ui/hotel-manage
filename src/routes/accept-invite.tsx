import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lookupInvitation, acceptInvitation, type InvitationInfo } from "@/lib/admin/invite.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Hotel, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({ token: z.string().optional() });

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Accept invitation — Hotel Management" }] }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const { token } = useSearch({ from: "/accept-invite" });
  const navigate = useNavigate();
  const lookup = useServerFn(lookupInvitation);
  const accept = useServerFn(acceptInvitation);

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    lookup({ data: { token } })
      .then((r) => setInfo(r))
      .catch(() => setInfo({ valid: false, reason: "error" }));
  }, [token, lookup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !info?.email) return;
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const email = info.email;
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error && !/already registered|already exists/i.test(error.message)) throw error;
      if (!data?.session) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      await accept({ data: { token } });
      await supabase.auth.signOut();
      toast.success("Account created. Please sign in.");
      navigate({ to: "/auth", search: { joined: "1" }, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return <Centered><p className="text-sm text-muted-foreground">Missing invitation token.</p></Centered>;
  }
  if (!info) return <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>;
  if (!info.valid) {
    return (
      <Centered>
        <p className="text-sm text-muted-foreground">
          This invitation is no longer valid ({info.reason}). Ask your administrator to generate a new link.
        </p>
      </Centered>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Hotel className="h-5 w-5" /></div>
          <div>
            <div className="text-lg font-bold">You're invited to</div>
            <div className="text-sm text-muted-foreground">{info.hotelName}</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-lg">
          <div className="mb-3 flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" /> Invitation valid
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={info.email ?? ""} readOnly disabled />
            </div>
            <div>
              <Label>Create password</Label>
              <Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            </div>
            <div>
              <Label>Confirm password</Label>
              <Input type="password" minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">{children}</div>;
}
