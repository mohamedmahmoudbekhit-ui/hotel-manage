import { useHotel } from "@/lib/hotel/store";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { MONTH_NAMES } from "@/lib/hotel/utils";
import { useI18n } from "@/lib/i18n";

const ADD_MONTH_VALUE = "__add_month__";

export function MonthSelector() {
  const { months, currentMonthKey, setCurrentMonthKey, addMonth } = useHotel();
  const { formatMonthKey } = useI18n();
  const keys = Object.keys(months).sort((a, b) => {
    const ma = months[a], mb = months[b];
    return ma.year !== mb.year ? ma.year - mb.year : ma.monthIndex - mb.monthIndex;
  });

  const handleChange = (value: string) => {
    if (value !== ADD_MONTH_VALUE) {
      setCurrentMonthKey(value);
      return;
    }
    // Always base the new month on the LATEST existing month, not the selected one.
    const latestKey = keys[keys.length - 1];
    const latest = months[latestKey];
    if (!latest) return;
    let y = latest.year, m = latest.monthIndex + 1;
    if (m > 11) { m = 0; y += 1; }
    addMonth(y, m);
    setCurrentMonthKey(`${y}-${String(m + 1).padStart(2, "0")}`);
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
      <Select value={currentMonthKey} onValueChange={handleChange}>
        <SelectTrigger className="min-w-0 flex-1 sm:w-[180px] sm:flex-none">
          <SelectValue>{formatMonthKey(currentMonthKey)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {keys.map((k) => (
            <SelectItem key={k} value={k}>{formatMonthKey(k)}</SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={ADD_MONTH_VALUE} className="font-medium text-primary">
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Month
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export { MONTH_NAMES };
