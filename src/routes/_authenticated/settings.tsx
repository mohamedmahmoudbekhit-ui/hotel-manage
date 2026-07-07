import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useHotel } from "@/lib/hotel/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MonthSelector } from "@/components/month-selector";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — 7 Heaven" },
      { name: "description", content: "Configure rooms, currency, USD conversion, and management share." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, updateSettings, currentMonth, updateMonthMeta, hotelName } = useHotel();
  const { t, formatMonthKey } = useI18n();
  const [newRoom, setNewRoom] = useState("");

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
        {hotelName && <p className="mt-2 text-sm font-medium text-foreground">{hotelName}</p>}
      </header>

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">{t("settings.general")}</h2>
        <p className="text-xs text-muted-foreground">{t("settings.generalSub")}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("settings.currency")}</Label>
            <Input value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.defaultRate", { c: settings.currency })}</Label>
            <Input type="number" step="0.01" value={settings.defaultUsdRate} onChange={(e) => updateSettings({ defaultUsdRate: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.defaultMgmt")}</Label>
            <Input type="number" step="1" min="0" max="100" value={Math.round(settings.defaultManagementPct * 100)} onChange={(e) => updateSettings({ defaultManagementPct: (parseFloat(e.target.value) || 0) / 100 })} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">{t("settings.rooms")}</h2>
        <p className="text-xs text-muted-foreground">{t("settings.roomsSub")}</p>
        <div className="mt-4 space-y-2">
          {settings.rooms.map((r) => (
            <div key={r} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
              <span className="font-medium">{r}</span>
              <Button variant="ghost" size="icon" onClick={() => {
                if (settings.rooms.length <= 1) { toast.error("Keep at least one room."); return; }
                updateSettings({ rooms: settings.rooms.filter((x) => x !== r) });
              }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder={t("settings.newRoom")} value={newRoom} onChange={(e) => setNewRoom(e.target.value)} />
          <Button onClick={() => {
            const name = newRoom.trim();
            if (!name) return;
            if (settings.rooms.includes(name)) { toast.error("Room already exists."); return; }
            updateSettings({ rooms: [...settings.rooms, name] });
            setNewRoom("");
          }}>
            <Plus className="me-1 h-4 w-4" /> {t("common.add")}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t("settings.monthParams")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("settings.monthParamsSub")} <span className="font-medium text-foreground">{formatMonthKey(currentMonth.key)}</span>
            </p>
          </div>
          <MonthSelector />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("settings.usdRate")}</Label>
            <Input type="number" step="0.01" value={currentMonth.usdRate} onChange={(e) => updateMonthMeta({ usdRate: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.mgmt")}</Label>
            <Input type="number" step="1" min="0" max="100" value={Math.round(currentMonth.managementPct * 100)} onChange={(e) => updateMonthMeta({ managementPct: (parseFloat(e.target.value) || 0) / 100 })} />
          </div>
        </div>
      </section>
    </div>
  );
}
