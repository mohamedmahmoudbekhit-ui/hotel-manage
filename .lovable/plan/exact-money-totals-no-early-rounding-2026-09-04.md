# Exact money totals (no early rounding)

Today the app stores booking amounts with full precision, but every place that shows money rounds to a whole number, and a few charts round each value before adding them up. That is why 15.64 + 10.05 shows as 26 instead of 25.69.

## What will change

1. **Money display shows 2 decimals.** All amounts (revenue, channel totals, room revenue, expenses, net, owner/management share, average per booking, refunds) will be shown as `25.69 EGP` instead of `26 EGP`.
2. **Nothing is rounded before adding up.** Chart bars and the monthly summary will be fed the exact stored values, and rounding happens only at the moment a number is drawn on screen.
3. **Exports match the screen.** CSV and PDF booking exports will carry the exact 2-decimal amounts and an exact total, instead of whole numbers.
4. **Compact labels** (the "1.2k" style short numbers used on chart axes) keep their short form for large numbers and show 2 decimals below 1,000.

## What will not change

No booking, refund, occupancy, channel, expense or iCal logic is touched. No stored data is modified or rewritten — all historical months, including August 2026 onward, will simply re-display from the original stored values with the corrected math, so past figures become exact automatically.

## Technical notes

- `formatCurrency` in `src/lib/hotel/utils.ts`: replace `Math.round(n)` with `toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })`; `formatShort` gets 2 decimals under 1,000.
- `src/routes/_authenticated/charts.tsx`: drop `Math.round(...)` on `revenueByChannel`, `revenueByRoom` and `totalRevenue`; pass raw values and format in the tooltip/labels only.
- `src/lib/hotel/export.ts`: replace `Math.round(r.amount)` with the exact value formatted to 2 decimals; total row sums raw amounts then formats.
- `src/routes/_authenticated/bookings.tsx` line ~1202 (`toFixed(0)` USD conversion preview) becomes `toFixed(2)`.
- `computeMonthTotals` already sums raw values — left untouched. `distributeTotal` (cent-accurate remainder split) stays as is: it guarantees nightly values sum back to the booking total exactly.
- Verify after the change with 15.64 + 10.05 = 25.69, 13.52 + 13.27 = 26.79, 14.49 + 10.75 = 25.24 against a month's dashboard total.
