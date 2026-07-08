import { createFileRoute } from "@tanstack/react-router";
import { ExpenseBreakdown } from "@/components/expense-breakdown";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — Hotel Management" },
      { name: "description", content: "Itemized monthly expense breakdown for your hotel." },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("nav.expenses")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("expenses.subtitle")}</p>
      </header>
      <ExpenseBreakdown />
    </div>
  );
}
