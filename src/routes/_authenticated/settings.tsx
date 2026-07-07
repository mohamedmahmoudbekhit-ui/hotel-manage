import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useHotel } from "@/lib/hotel/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MonthSelector } from "@/components/month-selector";
import { Plus, Trash2, RotateCcw, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/hotel/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — 7 Heaven" },
      { name: "description", content: "Configure rooms, currency, USD conversion, expenses, and management share." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, updateSettings, currentMonth, updateMonthMeta, addExpense, updateExpense, removeExpense, resetAll } = useHotel();
  const { t, formatMonthKey } = useI18n();
  const [newRoom, setNewRoom] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState("");

  const handleAddExpense = () => {
    const label = newLabel.trim();
    const amount = parseFloat(newAmount);
    if (!label) { toast.error(t("expenses.description")); return; }
    if (!isFinite(amount) || amount <= 0) { toast.error(t("expenses.amount")); return; }
    addExpense({ label, amount, date: newDate || undefined });
    setNewLabel(""); setNewAmount(""); setNewDate("");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
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
            <Input
              type="number"
              step="0.01"
              value={settings.defaultUsdRate}
              onChange={(e) => updateSettings({ defaultUsdRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.defaultMgmt")}</Label>
            <Input
              type="number"
              step="1"
              min="0"
              max="100"
              value={Math.round(settings.defaultManagementPct * 100)}
              onChange={(e) => updateSettings({ defaultManagementPct: (parseFloat(e.target.value) || 0) / 100 })}
            />
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (settings.rooms.length <= 1) { toast.error("Keep at least one room."); return; }
                  updateSettings({ rooms: settings.rooms.filter((x) => x !== r) });
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input placeholder={t("settings.newRoom")} value={newRoom} onChange={(e) => setNewRoom(e.target.value)} />
          <Button
            onClick={() => {
              const name = newRoom.trim();
              if (!name) return;
              if (settings.rooms.includes(name)) { toast.error("Room already exists."); return; }
              updateSettings({ rooms: [...settings.rooms, name] });
              setNewRoom("");
            }}
          >
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
            <Input
              type="number"
              step="0.01"
              value={currentMonth.usdRate}
              onChange={(e) => updateMonthMeta({ usdRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("settings.mgmt")}</Label>
            <Input
              type="number"
              step="1"
              min="0"
              max="100"
              value={Math.round(currentMonth.managementPct * 100)}
              onChange={(e) => updateMonthMeta({ managementPct: (parseFloat(e.target.value) || 0) / 100 })}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">{t("expenses.title")}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("expenses.subtitle")}</p>
          </div>
          <div className="rounded-xl border bg-muted/40 px-4 py-2 text-end">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("expenses.total")}</div>
            <div className="text-lg font-bold tabular-nums">{formatCurrency(currentMonth.expenses, settings.currency)}</div>
            <div className="text-[10px] text-muted-foreground">{t("expenses.autoTotal")}</div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start">{t("expenses.description")}</th>
                <th className="px-3 py-2 text-start w-32">{t("expenses.amount")}</th>
                <th className="px-3 py-2 text-start w-40">{t("expenses.date")}</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {(currentMonth.expenseItems ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">{t("expenses.empty")}</td></tr>
              ) : (
                currentMonth.expenseItems.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-2 py-1.5">
                      <Input
                        value={it.label}
                        onChange={(e) => updateExpense(it.id, { label: e.target.value })}
                        className="h-9 border-transparent bg-transparent hover:bg-muted/50 focus:bg-background"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        value={it.amount}
                        onChange={(e) => updateExpense(it.id, { amount: parseFloat(e.target.value) || 0 })}
                        className="h-9 tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="date"
                        value={it.date ?? ""}
                        onChange={(e) => updateExpense(it.id, { date: e.target.value || undefined })}
                        className="h-9"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Button variant="ghost" size="icon" onClick={() => removeExpense(it.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_160px_auto]">
          <Input
            placeholder={t("expenses.placeholderLabel")}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <Input
            type="number"
            step="0.01"
            placeholder={t("expenses.amount")}
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
          />
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <Button onClick={handleAddExpense}>
            <Plus className="me-1 h-4 w-4" /> {t("expenses.add")}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-base font-semibold text-destructive">{t("settings.danger")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("settings.dangerSub")}</p>
        <Button
          variant="destructive"
          className="mt-3"
          onClick={() => {
            if (confirm(t("settings.resetConfirm"))) {
              resetAll();
              toast.success("All data reset to defaults.");
            }
          }}
        >
          <RotateCcw className="me-1 h-4 w-4" /> {t("settings.reset")}
        </Button>
      </section>
    </div>
  );
}
