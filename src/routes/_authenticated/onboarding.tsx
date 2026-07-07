import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useHotel } from "@/lib/hotel/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Hotel, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up your hotel — 7 Heaven" }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { completeOnboarding } = useHotel();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [hotelName, setHotelName] = useState("");
  const [rooms, setRooms] = useState<string[]>(["Room 1", "Room 2", "Room 3"]);
  const [newRoom, setNewRoom] = useState("");
  const [usdRate, setUsdRate] = useState("49");
  const [managementPct, setManagementPct] = useState("20");
  const [currency, setCurrency] = useState("EGP");
  const [busy, setBusy] = useState(false);

  const addRoom = () => {
    const n = newRoom.trim();
    if (!n) return;
    if (rooms.includes(n)) { toast.error(t("onboarding.roomDup")); return; }
    setRooms((r) => [...r, n]);
    setNewRoom("");
  };
  const removeRoom = (name: string) => {
    if (rooms.length <= 1) { toast.error(t("onboarding.atLeastOne")); return; }
    setRooms((r) => r.filter((x) => x !== name));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = hotelName.trim();
    if (!name) { toast.error(t("onboarding.hotelRequired")); return; }
    const rate = parseFloat(usdRate);
    if (!isFinite(rate) || rate <= 0) { toast.error(t("onboarding.rateInvalid")); return; }
    const mgmt = parseFloat(managementPct);
    if (!isFinite(mgmt) || mgmt < 0 || mgmt > 100) { toast.error(t("onboarding.mgmtInvalid")); return; }
    if (rooms.length === 0) { toast.error(t("onboarding.atLeastOne")); return; }
    setBusy(true);
    try {
      await completeOnboarding({
        hotelName: name,
        rooms,
        usdRate: rate,
        managementPct: mgmt / 100,
        currency: currency.trim().toUpperCase() || "EGP",
      });
      toast.success(t("onboarding.success"));
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Hotel className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("onboarding.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-6 rounded-2xl border bg-card p-6 shadow-soft">
        <div className="space-y-1.5">
          <Label htmlFor="hotelName">{t("onboarding.hotelName")}</Label>
          <Input id="hotelName" required value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder={t("onboarding.hotelPlaceholder")} />
        </div>

        <div>
          <Label>{t("onboarding.rooms")}</Label>
          <p className="text-xs text-muted-foreground">{t("onboarding.roomsSub")}</p>
          <div className="mt-2 space-y-2">
            {rooms.map((r) => (
              <div key={r} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                <span className="font-medium">{r}</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeRoom(r)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input placeholder={t("settings.newRoom")} value={newRoom} onChange={(e) => setNewRoom(e.target.value)} />
            <Button type="button" onClick={addRoom}><Plus className="me-1 h-4 w-4" /> {t("common.add")}</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("onboarding.currency")}</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("onboarding.usdRate")}</Label>
            <Input type="number" step="0.01" value={usdRate} onChange={(e) => setUsdRate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("onboarding.mgmt")}</Label>
            <Input type="number" step="1" min="0" max="100" value={managementPct} onChange={(e) => setManagementPct(e.target.value)} />
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          {t("onboarding.submit")}
        </Button>
      </form>
    </div>
  );
}
