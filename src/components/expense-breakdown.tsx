import { useEffect, useState } from "react";
import { useHotel } from "@/lib/hotel/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MonthSelector } from "@/components/month-selector";
import { Plus, Trash2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { formatCurrency } from "@/lib/hotel/utils";

export function ExpenseBreakdown() {
  const { settings, currentMonth, addExpense, updateExpense, removeExpense } = useHotel();
  const { t, formatMonthKey } = useI18n();
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  // New expenses default to the month currently selected, not the system month.
  const monthFirstDay = `${currentMonth.year}-${String(currentMonth.monthIndex + 1).padStart(2, "0")}-01`;
  const [newDate, setNewDate] = useState(monthFirstDay);
  useEffect(() => { setNewDate(monthFirstDay); }, [monthFirstDay]);

  const handleAdd = () => {
    const label = newLabel.trim();
    const amount = parseFloat(newAmount);
    if (!label) { toast.error(t("expenses.description")); return; }
    if (!isFinite(amount) || amount <= 0) { toast.error(t("expenses.amount")); return; }
    addExpense({ label, amount, date: newDate || undefined });
    setNewLabel(""); setNewAmount(""); setNewDate(monthFirstDay);
  };


  return (
    <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{t("expenses.title")}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("expenses.subtitle")} — <span className="font-medium text-foreground">{formatMonthKey(currentMonth.key)}</span>
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <MonthSelector />
          <div className="rounded-xl border bg-muted/40 px-4 py-2 text-end">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("expenses.total")}</div>
            <div className="text-lg font-bold tabular-nums">{formatCurrency(currentMonth.expenses, settings.currency)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[560px] text-sm">
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
                    <Input value={it.label} onChange={(e) => updateExpense(it.id, { label: e.target.value })} className="h-9 border-transparent bg-transparent hover:bg-muted/50 focus:bg-background" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" step="0.01" value={it.amount} onChange={(e) => updateExpense(it.id, { amount: parseFloat(e.target.value) || 0 })} className="h-9 tabular-nums" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="date" value={it.date ?? ""} onChange={(e) => updateExpense(it.id, { date: e.target.value || undefined })} className="h-9" />
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
        <Input placeholder={t("expenses.placeholderLabel")} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <Input type="number" step="0.01" placeholder={t("expenses.amount")} value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
        <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        <Button onClick={handleAdd}><Plus className="me-1 h-4 w-4" /> {t("expenses.add")}</Button>
      </div>
    </section>
  );
}
