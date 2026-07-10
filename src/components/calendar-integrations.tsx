import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ensureAndListRooms,
  listCalendarSources,
  saveCalendarSource,
  deleteCalendarSource,
  syncOneSource,
  syncAllForUser,
  type CalendarSourceRow,
  type RoomRow,
} from "@/lib/hotel/calendar.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, RefreshCw, Trash2, AlertCircle, CheckCircle2, Link as LinkIcon, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { isLikelyIcalUrl } from "@/lib/ical/parse";
import { useHotel } from "@/lib/hotel/store";

const PLATFORMS = [
  { value: "airbnb", label: "Airbnb" },
  { value: "booking", label: "Booking.com" },
  { value: "vrbo", label: "Vrbo" },
  { value: "direct", label: "Direct" },
  { value: "other", label: "Other" },
];

interface EditorState {
  id?: string;
  room_id: string;
  source_name: string;
  platform_type: string;
  ical_url: string;
  is_active: boolean;
}

function emptyEditor(roomId: string): EditorState {
  return { room_id: roomId, source_name: "", platform_type: "airbnb", ical_url: "", is_active: true };
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function CalendarIntegrations() {
  const { settings } = useHotel();
  const { t } = useI18n();
  const ensureRooms = useServerFn(ensureAndListRooms);
  const listSources = useServerFn(listCalendarSources);
  const save = useServerFn(saveCalendarSource);
  const del = useServerFn(deleteCalendarSource);
  const syncOne = useServerFn(syncOneSource);
  const syncAll = useServerFn(syncAllForUser);

  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [sources, setSources] = useState<CalendarSourceRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const refresh = useCallback(async () => {
    const [r, s] = await Promise.all([
      ensureRooms({ data: { names: settings.rooms } }),
      listSources(),
    ]);
    setRooms(r);
    setSources(s);
  }, [ensureRooms, listSources, settings.rooms]);

  useEffect(() => {
    refresh().catch((e) => console.error(e));
  }, [refresh]);

  useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const doSave = async (payload: EditorState) => {
    if (!payload.source_name.trim()) { toast.error(t("cal.errName")); return false; }
    if (!isLikelyIcalUrl(payload.ical_url)) { toast.error(t("cal.errUrl")); return false; }
    try {
      const { id } = await save({ data: payload });
      toast.success(t("cal.saved"));
      // Trigger initial sync
      syncOne({ data: { id } }).then(() => refresh()).catch(() => {});
      await refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const doDelete = async (id: string) => {
    if (!window.confirm(t("cal.confirmDelete"))) return;
    setBusy(id);
    try {
      await del({ data: { id } });
      toast.success(t("cal.deleted"));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doSyncOne = async (id: string) => {
    setBusy(id);
    try {
      const out = await syncOne({ data: { id } });
      if (out.ok) {
        toast.success(t("cal.syncOk", { n: out.imported }));
      } else {
        toast.error(out.error ?? t("cal.syncFail"));
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doSyncAll = async () => {
    setSyncingAll(true);
    try {
      const r = await syncAll();
      if (r.failed > 0) toast.warning(t("cal.syncAllPartial", { total: r.total, failed: r.failed }));
      else toast.success(t("cal.syncAllOk", { total: r.total }));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("cal.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("cal.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={doSyncAll} disabled={syncingAll || sources.length === 0}>
          <RefreshCw className={`me-1 h-3.5 w-3.5 ${syncingAll ? "animate-spin" : ""}`} />
          {t("cal.syncAll")}
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {rooms.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("cal.noRooms")}</p>
        )}
        {rooms.map((room) => {
          const roomSources = sources.filter((s) => s.room_id === room.id);
          return (
            <div key={room.id} className="rounded-xl border bg-background/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{room.room_name}</h3>
                <SourceEditor
                  initial={emptyEditor(room.id)}
                  onSubmit={doSave}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Plus className="me-1 h-3.5 w-3.5" /> {t("cal.add")}
                    </Button>
                  }
                />
              </div>
              {roomSources.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">{t("cal.empty")}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {roomSources.map((s) => (
                    <li key={s.id} className="rounded-lg border bg-card p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {PLATFORMS.find((p) => p.value === s.platform_type)?.label ?? s.platform_type}
                        </span>
                        <span className="text-sm font-medium">{s.source_name}</span>
                        {s.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> {t("cal.active")}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">{t("cal.inactive")}</span>
                        )}
                        <span className="ms-auto flex items-center gap-1">
                          <Button variant="ghost" size="icon" title={t("cal.syncNow")} disabled={busy === s.id} onClick={() => doSyncOne(s.id)}>
                            <RefreshCw className={`h-3.5 w-3.5 ${busy === s.id ? "animate-spin" : ""}`} />
                          </Button>
                          <SourceEditor
                            initial={{
                              id: s.id,
                              room_id: s.room_id,
                              source_name: s.source_name,
                              platform_type: s.platform_type,
                              ical_url: s.ical_url,
                              is_active: s.is_active,
                            }}
                            onSubmit={doSave}
                            rooms={rooms}
                            trigger={
                              <Button variant="ghost" size="icon" title={t("common.save")}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            }
                          />
                          <Button variant="ghost" size="icon" disabled={busy === s.id} onClick={() => doDelete(s.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 truncate max-w-[260px]">
                          <LinkIcon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{s.ical_url}</span>
                        </span>
                        <span>{t("cal.lastSync")}: {relativeTime(s.last_sync_at)}</span>
                        <span>{t("cal.created")}: {new Date(s.created_at).toLocaleDateString()}</span>
                      </div>
                      {s.last_sync_error && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          {s.last_sync_error}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {/* silence unused var lint when only shown in nested block */}
      <span className="hidden">{roomsById.size}</span>
    </section>
  );
}

function SourceEditor({
  initial,
  onSubmit,
  trigger,
  rooms,
}: {
  initial: EditorState;
  onSubmit: (payload: EditorState) => Promise<boolean>;
  trigger: React.ReactNode;
  rooms?: RoomRow[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<EditorState>(initial);

  useEffect(() => {
    if (open) setState(initial);
  }, [open, initial]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("cal.sourceName")}</Label>
            <Input value={state.source_name} onChange={(e) => setState((s) => ({ ...s, source_name: e.target.value }))} placeholder="Airbnb" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("cal.platform")}</Label>
            <Select value={state.platform_type} onValueChange={(v) => setState((s) => ({ ...s, platform_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {rooms && rooms.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("cal.room")}</Label>
              <Select value={state.room_id} onValueChange={(v) => setState((s) => ({ ...s, room_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.room_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("cal.icalUrl")}</Label>
            <Input value={state.ical_url} onChange={(e) => setState((s) => ({ ...s, ical_url: e.target.value }))} placeholder="https://…/calendar.ics" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-2">
            <Label className="text-xs">{t("cal.active")}</Label>
            <Switch checked={state.is_active} onCheckedChange={(v) => setState((s) => ({ ...s, is_active: v }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={async () => {
              const ok = await onSubmit(state);
              if (ok) setOpen(false);
            }}>{t("common.save")}</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
