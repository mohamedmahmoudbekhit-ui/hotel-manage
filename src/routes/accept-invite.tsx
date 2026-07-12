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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [session, setSession] = useState<boolean>(false);

  useEffect(() => {
    if (!token) return;
    lookup({ data: { token } }).then((r) => {
      setInfo(r);
      if (r.email) setEmail(r.email);
    }).catch(() => setInfo({ valid: false, reason: "error" }));
  }, [token, lookup]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const finalize = async () => {
    if (!token) return;
    try {
      await accept({ data: { token } });
      toast.success("You're in!");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  useEffect(() => {
    // If session becomes present and we have a valid invitation, accept it automatically
    if (session && info?.valid && token) finalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, info?.valid]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/accept-invite?token=${token}` } });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setBusy(false); }
  };

  if (!token) {
    return <Centered><p className="text-sm text-muted-foreground">Missing invitation token.</p></Centered>;
  }
  if (!info) return <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>;
  if (!info.valid) {
    return <Centered><p className="text-sm text-muted-foreground">This invitation is not valid ({info.reason}).</p></Centered>;
  }

  if (session) {
    return <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><p className="mt-3 text-sm">Accepting invitation…</p></Centered>;
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
            <CheckCircle2 className="h-4 w-4" /> Invitation valid — {info.email}
          </div>
          <form onSubmit={handleAuth} className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label>{mode === "signup" ? "Create password" : "Password"}</Label>
              <Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {mode === "signup" ? "Create account & join" : "Sign in & join"}
            </Button>
          </form>
          <div className="mt-3 text-center text-sm text-muted-foreground">
            {mode === "signup" ? (
              <>Already have an account? <button className="font-semibold text-primary hover:underline" onClick={() => setMode("signin")}>Sign in</button></>
            ) : (
              <>New here? <button className="font-semibold text-primary hover:underline" onClick={() => setMode("signup")}>Create account</button></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">{children}</div>;
}
