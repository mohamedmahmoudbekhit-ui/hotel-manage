import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useHotel } from "@/lib/hotel/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthSelector } from "@/components/month-selector";
import { Plus, Trash2, Upload, Hotel as HotelIcon, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { CalendarIntegrations } from "@/components/calendar-integrations";



export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hotel Management" },
      { name: "description", content: "Configure rooms, channels, currency, USD conversion, and management share." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, updateSettings, addChannel, updateChannel, removeChannel, currentMonth, updateMonthMeta, hotelName, setHotelName, logoUrl, setLogoUrl } = useHotel();
  const { t, formatMonthKey } = useI18n();
  const [newRoom, setNewRoom] = useState("");
  const [nameDraft, setNameDraft] = useState(hotelName);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newCh, setNewCh] = useState<{ name: string; currency: "LOCAL" | "USD"; color: string }>({
    name: "",
    currency: "LOCAL",
    color: "#0ea5e9",
  });

  const handleLogoFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("settings.logoInvalid"));
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error(t("settings.logoTooBig"));
      return;
    }
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/png");
        setLogoUrl(dataUrl);
        toast.success(t("settings.logoSaved"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
        {hotelName && <p className="mt-2 text-sm font-medium text-foreground">{hotelName}</p>}
      </header>

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">{t("settings.hotelIdentity")}</h2>
        <p className="text-xs text-muted-foreground">{t("settings.hotelIdentitySub")}</p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border bg-muted">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <HotelIcon className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="me-1 h-3.5 w-3.5" /> {t("settings.uploadLogo")}
              </Button>
              {logoUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(undefined)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLogoFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label>{t("settings.hotelName")}</Label>
            <div className="flex gap-2">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder={t("onboarding.hotelPlaceholder")} />
              <Button
                type="button"
                onClick={() => {
                  const trimmed = nameDraft.trim();
                  if (!trimmed) { toast.error(t("onboarding.hotelRequired")); return; }
                  setHotelName(trimmed);
                  toast.success(t("settings.nameSaved"));
                }}
                disabled={nameDraft.trim() === hotelName}
              >
                {t("common.save")}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">{t("settings.logoHint")}</p>
          </div>
        </div>
      </section>

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
        <h2 className="text-base font-semibold">{t("settings.channels")}</h2>
        <p className="text-xs text-muted-foreground">{t("settings.channelsSub")}</p>
        <div className="mt-4 space-y-2">
          {settings.channels.map((ch) => (
            <div key={ch.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <input
                type="color"
                value={ch.color}
                onChange={(e) => updateChannel(ch.id, { color: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border bg-background"
                aria-label={t("settings.channelColor")}
              />
              <Input
                value={ch.name}
                onChange={(e) => updateChannel(ch.id, { name: e.target.value })}
                className="h-9"
              />
              <Select value={ch.currency} onValueChange={(v) => updateChannel(ch.id, { currency: v as "LOCAL" | "USD" })}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOCAL">{settings.currency} ({t("settings.local")})</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
              <span className="h-6 w-6 rounded-full border" style={{ background: ch.color }} />
              <Button variant="ghost" size="icon" onClick={() => {
                if (settings.channels.length <= 1) { toast.error(t("settings.channelKeepOne")); return; }
                removeChannel(ch.id);
              }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-dashed bg-background/50 p-3">
          <input
            type="color"
            value={newCh.color}
            onChange={(e) => setNewCh((s) => ({ ...s, color: e.target.value }))}
            className="h-9 w-10 cursor-pointer rounded border bg-background"
            aria-label={t("settings.channelColor")}
          />
          <Input
            placeholder={t("settings.newChannelName")}
            value={newCh.name}
            onChange={(e) => setNewCh((s) => ({ ...s, name: e.target.value }))}
            className="h-9"
          />
          <Select value={newCh.currency} onValueChange={(v) => setNewCh((s) => ({ ...s, currency: v as "LOCAL" | "USD" }))}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="LOCAL">{settings.currency} ({t("settings.local")})</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => {
            const name = newCh.name.trim();
            if (!name) return;
            if (settings.channels.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
              toast.error(t("settings.channelDup"));
              return;
            }
            addChannel({ name, currency: newCh.currency, color: newCh.color });
            setNewCh({ name: "", currency: "LOCAL", color: "#0ea5e9" });
          }}>
            <Plus className="me-1 h-4 w-4" /> {t("common.add")}
          </Button>
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
