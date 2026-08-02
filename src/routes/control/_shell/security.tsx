import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMfaStatus, regenerateRecoveryCodes, type MfaStatus } from "@/lib/admin/mfa.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, KeyRound, Copy, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/control/_shell/security")({
  component: SecurityPage,
});

function SecurityPage() {
  const statusFn = useServerFn(getMfaStatus);
  const regenFn = useServerFn(regenerateRecoveryCodes);
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [factorName, setFactorName] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    statusFn().then(setStatus).catch(() => {});
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = (data?.totp ?? []).find((f) => f.status === "verified");
      setFactorName(totp?.friendly_name ?? "Authenticator app");
    });
  }, [statusFn]);

  const regenerate = async () => {
    setBusy(true);
    try {
      const result = await regenFn({ data: undefined } as never);
      setCodes(result.codes);
      setStatus((s) => (s ? { ...s, remainingCodes: result.codes.length } : s));
      toast.success("New recovery codes generated");
    } catch {
      toast.error("Could not generate recovery codes");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="text-sm text-muted-foreground">Multi-factor settings for your platform administrator account.</p>
      </div>

      <Card className="space-y-2 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><Smartphone className="h-4 w-4" /> Authenticator app</div>
        <p className="text-sm text-muted-foreground">
          Active factor: <span className="font-medium text-foreground">{factorName ?? "—"}</span>. Codes rotate every 30 seconds
          in Google Authenticator, Microsoft Authenticator, or any TOTP app.
        </p>
        <div className="flex items-center gap-1.5 text-xs text-green-600"><ShieldCheck className="h-3.5 w-3.5" /> Verified — required at every sign-in</div>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" /> Backup recovery codes</div>
        <p className="text-sm text-muted-foreground">
          {status ? `${status.remainingCodes} unused code${status.remainingCodes === 1 ? "" : "s"} remaining.` : "Loading…"}{" "}
          Regenerating invalidates all previous codes.
        </p>
        {codes.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-xs">
              {codes.map((c) => <div key={c}>{c}</div>)}
            </div>
            <Button variant="secondary" size="sm" className="gap-2" onClick={() => { navigator.clipboard.writeText(codes.join("\n")); toast.success("Copied"); }}>
              <Copy className="h-4 w-4" /> Copy codes
            </Button>
          </>
        )}
        <Button onClick={regenerate} disabled={busy} className="w-fit">
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />} Generate new codes
        </Button>
      </Card>
    </div>
  );
}
