import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hotel, Loader2, MailCheck, ArrowLeft } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth/account.functions";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password — Hotel Management" },
      { name: "description", content: "Request a secure password reset link for your Hotel Management account." },
      { property: "og:title", content: "Forgot password — Hotel Management" },
      { property: "og:description", content: "Request a secure password reset link." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const request = useServerFn(requestPasswordReset);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await request({ data: { email, redirectTo: `${window.location.origin}/reset-password` } });
    } catch {
      // Deliberately ignored: the response must never differ per address.
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <Shell>
      {sent ? (
        <div className="text-center">
          <MailCheck className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-3 text-xl font-bold">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            If an account exists for this email, a reset link has been sent. The link expires in 1 hour and can be used once.
          </p>
          <Button asChild variant="outline" className="mt-5 w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email and we'll send you a secure link to choose a new password.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              Send reset link
            </Button>
          </form>
          <Link to="/login" className="mt-4 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft className="h-3 w-3" /> Back to sign in
          </Link>
        </>
      )}
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Hotel className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold">Hotel Management</div>
            <div className="text-xs text-muted-foreground">Property management suite</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-lg">{children}</div>
      </div>
    </div>
  );
}
