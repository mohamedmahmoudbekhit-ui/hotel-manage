import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hotel, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

const searchSchema = z.object({ joined: z.string().optional(), reset: z.string().optional() });

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Sign in — Hotel Management" },
      { name: "description", content: "Sign in to your Hotel Management account with your email and password." },
      { property: "og:title", content: "Sign in — Hotel Management" },
      { property: "og:description", content: "Access your hotel dashboard, bookings and reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t, toggle, lang, dir } = useI18n();
  const navigate = useNavigate();
  const { joined, reset } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);

      // Platform administrators authenticate only in the separate admin portal.
      const { data: isSuperAdmin } = await supabase.rpc("ensure_super_admin_self");
      if (isSuperAdmin === true) {
        await supabase.auth.signOut();
        setPassword("");
        toast.error(
          "This email is registered as a platform administrator, so it can't be used as a hotel or employee account. Sign in at the admin portal, or ask your owner to invite a different email.",
          { duration: 8000 },
        );
        return;
      }


      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setBusy(false);
    }
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
          {(joined || reset) && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/10 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {joined
                ? "Your account is active. Sign in with your email and new password."
                : "Your password has been updated. Sign in to continue."}
            </div>
          )}
          <h1 className="text-xl font-bold">{t("auth.signInTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>

          <form onSubmit={handleSignIn} className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("auth.signIn")}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Access is invitation only. Ask your administrator for an invitation link.
          </p>
        </div>
      </div>
    </div>
  );
}
