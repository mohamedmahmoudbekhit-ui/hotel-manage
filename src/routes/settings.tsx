import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useHotel } from "@/lib/hotel/store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MonthSelector } from "@/components/month-selector";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Guesthouse OS" },
      { name: "description", content: "Configure rooms, currency, USD conversion, and management share." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, updateSettings, currentMonth, updateMonthMeta, resetAll } = useHotel();
  const [newRoom, setNewRoom] = useState("");

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">System configuration and per-month parameters</p>
      </header>

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">General</h2>
        <p className="text-xs text-muted-foreground">Applies to all months</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Input value={settings.currency} onChange={(e) => updateSettings({ currency: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label>Default USD → {settings.currency} rate</Label>
            <Input
              type="number"
              step="0.01"
              value={settings.defaultUsdRate}
              onChange={(e) => updateSettings({ defaultUsdRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default management share (%)</Label>
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
        <h2 className="text-base font-semibold">Rooms</h2>
        <p className="text-xs text-muted-foreground">Add or remove rooms — bookings for removed rooms are preserved.</p>
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
          <Input placeholder="New room name" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} />
          <Button
            onClick={() => {
              const name = newRoom.trim();
              if (!name) return;
              if (settings.rooms.includes(name)) { toast.error("Room already exists."); return; }
              updateSettings({ rooms: [...settings.rooms, name] });
              setNewRoom("");
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Month parameters</h2>
            <p className="text-xs text-muted-foreground">
              Expenses, USD rate, and management share for <span className="font-medium text-foreground">{currentMonth.key}</span>
            </p>
          </div>
          <MonthSelector />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Expenses ({settings.currency})</Label>
            <Input
              type="number"
              value={currentMonth.expenses}
              onChange={(e) => updateMonthMeta({ expenses: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>USD rate</Label>
            <Input
              type="number"
              step="0.01"
              value={currentMonth.usdRate}
              onChange={(e) => updateMonthMeta({ usdRate: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Management share (%)</Label>
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

      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
        <p className="mt-1 text-xs text-muted-foreground">Reset all data back to the seeded June 2026 example.</p>
        <Button
          variant="destructive"
          className="mt-3"
          onClick={() => {
            if (confirm("Reset all data? This cannot be undone.")) {
              resetAll();
              toast.success("All data reset to defaults.");
            }
          }}
        >
          <RotateCcw className="mr-1 h-4 w-4" /> Reset all data
        </Button>
      </section>
    </div>
  );
}
