import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listRoomFeeds, regenerateRoomFeedToken, ensureAndListRooms, type RoomFeedRow } from "@/lib/hotel/calendar.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { useHotel } from "@/lib/hotel/store";

function feedUrl(origin: string, room: RoomFeedRow): string {
  return `${origin}/api/public/ical/${room.id}/${room.token}.ics`;
}

export function IcalExport() {
  const { settings } = useHotel();
  const ensureRooms = useServerFn(ensureAndListRooms);
  const listFeeds = useServerFn(listRoomFeeds);
  const regenerate = useServerFn(regenerateRoomFeedToken);

  const [rooms, setRooms] = useState<RoomFeedRow[]>([]);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const refresh = useCallback(async () => {
    await ensureRooms({ data: { names: settings.rooms } });
    setRooms(await listFeeds());
  }, [ensureRooms, listFeeds, settings.rooms]);

  useEffect(() => {
    refresh().catch((e) => console.error(e));
  }, [refresh]);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Feed link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const doRegenerate = async (room: RoomFeedRow) => {
    if (!window.confirm(`Regenerate the link for ${room.room_name}? The old link stops working immediately.`)) return;
    setBusy(room.id);
    try {
      const { token } = await regenerate({ data: { room_id: room.id } });
      setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, token } : r)));
      toast.success("New link generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Export calendar (iCal)</h2>
          <p className="text-xs text-muted-foreground">
            Share each room&apos;s read-only link with Airbnb, Booking.com, Vrbo or any platform that supports iCal
            import. Only confirmed in-app bookings are published.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {rooms.length === 0 && <p className="text-sm text-muted-foreground">Add rooms first to generate feeds.</p>}
        {rooms.map((room) => {
          const url = origin ? feedUrl(origin, room) : "";
          return (
            <div key={room.id} className="rounded-xl border bg-background/50 p-3">
              <h3 className="text-sm font-semibold">{room.room_name}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => copy(url)} disabled={!url}>
                  <Copy className="me-1 h-3.5 w-3.5" /> Copy
                </Button>
                <Button variant="ghost" size="sm" asChild disabled={!url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    <Download className="me-1 h-3.5 w-3.5" /> Preview
                  </a>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => doRegenerate(room)} disabled={busy === room.id}>
                  <RefreshCw className={`me-1 h-3.5 w-3.5 ${busy === room.id ? "animate-spin" : ""}`} /> Regenerate
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
