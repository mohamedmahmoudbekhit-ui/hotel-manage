import { useHotel } from "@/lib/hotel/store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { MONTH_NAMES } from "@/lib/hotel/utils";
import { useI18n } from "@/lib/i18n";

export function MonthSelector() {
  const { months, currentMonthKey, setCurrentMonthKey, addMonth } = useHotel();
  const { formatMonthKey } = useI18n();
  const keys = Object.keys(months).sort((a, b) => {
    const ma = months[a], mb = months[b];
    return ma.year !== mb.year ? ma.year - mb.year : ma.monthIndex - mb.monthIndex;
  });

  const handleAdd = () => {
    const cur = months[currentMonthKey];
    let y = cur.year, m = cur.monthIndex + 1;
    if (m > 11) { m = 0; y += 1; }
    addMonth(y, m);
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={currentMonthKey} onValueChange={setCurrentMonthKey}>
        <SelectTrigger className="w-[180px]">
          <SelectValue>{formatMonthKey(currentMonthKey)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {keys.map((k) => (
            <SelectItem key={k} value={k}>{formatMonthKey(k)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" onClick={handleAdd} title="Add next month">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

export { MONTH_NAMES };
