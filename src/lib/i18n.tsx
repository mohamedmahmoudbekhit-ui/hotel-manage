import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

type Dict = Record<string, string>;

const en: Dict = {
  "brand.name": "7 Heaven",
  "brand.tagline": "Revenue & Occupancy",
  "nav.workspace": "Workspace",
  "nav.dashboard": "Dashboard",
  "nav.bookings": "Bookings",
  "nav.expenses": "Expenses",
  "nav.charts": "Charts",
  "nav.summary": "Monthly Summary",
  "nav.settings": "Settings",
  "lang.toggle": "العربية",

  "auth.signInTitle": "Welcome back",
  "auth.signUpTitle": "Create your account",
  "auth.subtitle": "Manage your hotel bookings, revenue and expenses.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.signUp": "Sign up",
  "auth.signOut": "Sign out",
  "auth.continueGoogle": "Continue with Google",
  "auth.or": "or",
  "auth.noAccount": "No account?",
  "auth.haveAccount": "Already have an account?",
  "auth.checkEmail": "Check your email to confirm your account.",

  "onboarding.title": "Set up your hotel",
  "onboarding.subtitle": "A few quick details to get you started.",
  "onboarding.hotelName": "Hotel / Guesthouse name",
  "onboarding.hotelPlaceholder": "e.g. Nile View Guesthouse",
  "onboarding.rooms": "Rooms",
  "onboarding.roomsSub": "Add the rooms you manage. You can add or remove more later.",
  "onboarding.currency": "Local currency",
  "onboarding.usdRate": "USD → local rate",
  "onboarding.mgmt": "Management share (%)",
  "onboarding.submit": "Save and continue",
  "onboarding.success": "Hotel ready.",
  "onboarding.hotelRequired": "Hotel name is required",
  "onboarding.rateInvalid": "USD rate must be a positive number",
  "onboarding.mgmtInvalid": "Management share must be 0–100",
  "onboarding.roomDup": "Room already added",
  "onboarding.atLeastOne": "Keep at least one room",

  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.remove": "Remove",
  "common.add": "Add",
  "common.delete": "Delete",
  "common.total": "Total",
  "common.month": "Month",
  "common.overviewFor": "Overview for",
  "common.tapCell": "Tap a cell to edit",
  "common.emptyDays": "empty days",
  "common.bookings": "bookings",

  "kpi.totalRevenue": "Total Revenue",
  "kpi.occupancyRate": "Occupancy Rate",
  "kpi.bookings": "Bookings",
  "kpi.avgPerBooking": "Avg Revenue / Booking",
  "kpi.airbnbRev": "Airbnb Revenue",
  "kpi.bookingRev": "Booking.com Revenue",
  "kpi.offlineRev": "Offline Revenue",
  "kpi.bestRoom": "Best Performing Room",
  "kpi.expenses": "Expenses",
  "kpi.ownerShare": "Net / Owner Share",
  "kpi.mgmt": "Mgmt",
  "kpi.best": "Best",
  "kpi.revenueByRoom": "Revenue by Room",
  "kpi.pctOfRevenue": "% of revenue",
  "kpi.emptyDaysPerRoom": "Empty Days per Room",
  "kpi.nights": "nights",

  "bookings.title": "Bookings",
  "bookings.day": "Day",
  "bookings.price": "Price",
  "bookings.type": "Type",
  "bookings.status": "Status",
  "bookings.inCurrency": "In",
  "bookings.inUsd": "In USD",
  "bookings.revenue": "Revenue",
  "type.Airbnb": "Airbnb",
  "type.Booking": "Booking",
  "type.Offline": "Offline",
  "status.Confirmed": "Confirmed",
  "status.Pending": "Pending",
  "status.Cancelled": "Cancelled",

  "charts.title": "Charts",
  "charts.visualFor": "Visual insights for",
  "charts.byType": "Bookings by Type",
  "charts.byTypeSub": "Distribution of bookings this month",
  "charts.bySource": "Revenue by Source",
  "charts.byRoom": "Revenue by Room",
  "charts.byRoomSub": "Room performance",
  "charts.trend": "Occupancy Trend",
  "charts.trendSub": "Monthly occupancy across all rooms",

  "summary.title": "Monthly Summary",
  "summary.subtitle": "Compare performance across every month",
  "summary.revenue": "Revenue",
  "summary.bookings": "Bookings",
  "summary.occupancy": "Occupancy",
  "summary.net": "Net",
  "summary.trend": "Trend",

  "settings.title": "Settings",
  "settings.subtitle": "System configuration and per-month parameters",
  "settings.general": "General",
  "settings.generalSub": "Applies to all months",
  "settings.currency": "Currency",
  "settings.defaultRate": "Default USD → {c} rate",
  "settings.defaultMgmt": "Default management share (%)",
  "settings.rooms": "Rooms",
  "settings.roomsSub": "Add or remove rooms — bookings for removed rooms are preserved.",
  "settings.newRoom": "New room name",
  "settings.monthParams": "Month parameters",
  "settings.monthParamsSub": "Expenses, USD rate, and management share for",
  "settings.expenses": "Expenses ({c})",
  "settings.usdRate": "USD rate",
  "settings.mgmt": "Management share (%)",
  "settings.danger": "Danger zone",
  "settings.dangerSub": "Reset all data back to the seeded June 2026 example.",
  "settings.reset": "Reset all data",
  "settings.resetConfirm": "Reset all data? This cannot be undone.",

  "expenses.title": "Expense Breakdown",
  "expenses.subtitle": "Itemize what you paid and what for — the total updates automatically.",
  "expenses.description": "Description",
  "expenses.amount": "Amount",
  "expenses.date": "Date",
  "expenses.add": "Add expense",
  "expenses.placeholderLabel": "e.g. Cleaning, Utilities, Laundry…",
  "expenses.empty": "No expenses recorded yet.",
  "expenses.total": "Total expenses",
  "expenses.autoTotal": "Computed from the items below",

  "month.January": "January",
  "month.February": "February",
  "month.March": "March",
  "month.April": "April",
  "month.May": "May",
  "month.June": "June",
  "month.July": "July",
  "month.August": "August",
  "month.September": "September",
  "month.October": "October",
  "month.November": "November",
  "month.December": "December",
};

const ar: Dict = {
  "brand.name": "سفن هيفن",
  "brand.tagline": "الإيرادات والإشغال",
  "nav.workspace": "مساحة العمل",
  "nav.dashboard": "لوحة التحكم",
  "nav.bookings": "الحجوزات",
  "nav.expenses": "المصروفات",
  "nav.charts": "الرسوم البيانية",
  "nav.summary": "الملخص الشهري",
  "nav.settings": "الإعدادات",
  "lang.toggle": "English",

  "auth.signInTitle": "مرحباً بعودتك",
  "auth.signUpTitle": "أنشئ حسابك",
  "auth.subtitle": "أدر حجوزات فندقك وإيراداته ومصروفاته.",
  "auth.email": "البريد الإلكتروني",
  "auth.password": "كلمة المرور",
  "auth.signIn": "تسجيل الدخول",
  "auth.signUp": "إنشاء حساب",
  "auth.signOut": "تسجيل الخروج",
  "auth.continueGoogle": "المتابعة عبر Google",
  "auth.or": "أو",
  "auth.noAccount": "ليس لديك حساب؟",
  "auth.haveAccount": "لديك حساب بالفعل؟",
  "auth.checkEmail": "تحقق من بريدك لتأكيد الحساب.",

  "onboarding.title": "إعداد فندقك",
  "onboarding.subtitle": "بضع تفاصيل سريعة للبدء.",
  "onboarding.hotelName": "اسم الفندق / بيت الضيافة",
  "onboarding.hotelPlaceholder": "مثال: بيت ضيافة إطلالة النيل",
  "onboarding.rooms": "الغرف",
  "onboarding.roomsSub": "أضف الغرف التي تديرها. يمكنك التعديل لاحقاً.",
  "onboarding.currency": "العملة المحلية",
  "onboarding.usdRate": "سعر تحويل USD → المحلي",
  "onboarding.mgmt": "نسبة الإدارة (%)",
  "onboarding.submit": "حفظ ومتابعة",
  "onboarding.success": "تم إعداد الفندق.",
  "onboarding.hotelRequired": "اسم الفندق مطلوب",
  "onboarding.rateInvalid": "يجب أن يكون سعر الدولار رقماً موجباً",
  "onboarding.mgmtInvalid": "يجب أن تكون نسبة الإدارة بين 0 و 100",
  "onboarding.roomDup": "الغرفة مضافة بالفعل",
  "onboarding.atLeastOne": "احتفظ بغرفة واحدة على الأقل",

  "common.save": "حفظ",
  "common.cancel": "إلغاء",
  "common.remove": "إزالة",
  "common.add": "إضافة",
  "common.delete": "حذف",
  "common.total": "الإجمالي",
  "common.month": "الشهر",
  "common.overviewFor": "نظرة عامة عن",
  "common.tapCell": "اضغط على خلية للتعديل",
  "common.emptyDays": "أيام فارغة",
  "common.bookings": "حجوزات",

  "kpi.totalRevenue": "إجمالي الإيرادات",
  "kpi.occupancyRate": "نسبة الإشغال",
  "kpi.bookings": "الحجوزات",
  "kpi.avgPerBooking": "متوسط الإيراد / حجز",
  "kpi.airbnbRev": "إيرادات Airbnb",
  "kpi.bookingRev": "إيرادات Booking.com",
  "kpi.offlineRev": "الإيرادات المباشرة",
  "kpi.bestRoom": "أفضل غرفة أداءً",
  "kpi.expenses": "المصروفات",
  "kpi.ownerShare": "الصافي / حصة المالك",
  "kpi.mgmt": "الإدارة",
  "kpi.best": "الأفضل",
  "kpi.revenueByRoom": "الإيرادات حسب الغرفة",
  "kpi.pctOfRevenue": "% من الإيرادات",
  "kpi.emptyDaysPerRoom": "الأيام الفارغة لكل غرفة",
  "kpi.nights": "ليلة",

  "bookings.title": "الحجوزات",
  "bookings.day": "اليوم",
  "bookings.price": "السعر",
  "bookings.type": "النوع",
  "bookings.status": "الحالة",
  "bookings.inCurrency": "بعملة",
  "bookings.inUsd": "بالدولار",
  "bookings.revenue": "الإيراد",
  "type.Airbnb": "Airbnb",
  "type.Booking": "Booking",
  "type.Offline": "مباشر",
  "status.Confirmed": "مؤكد",
  "status.Pending": "معلّق",
  "status.Cancelled": "ملغى",

  "charts.title": "الرسوم البيانية",
  "charts.visualFor": "تحليلات بصرية لـ",
  "charts.byType": "الحجوزات حسب النوع",
  "charts.byTypeSub": "توزيع الحجوزات هذا الشهر",
  "charts.bySource": "الإيرادات حسب المصدر",
  "charts.byRoom": "الإيرادات حسب الغرفة",
  "charts.byRoomSub": "أداء الغرف",
  "charts.trend": "اتجاه الإشغال",
  "charts.trendSub": "الإشغال الشهري لجميع الغرف",

  "summary.title": "الملخص الشهري",
  "summary.subtitle": "قارن الأداء عبر كل شهر",
  "summary.revenue": "الإيرادات",
  "summary.bookings": "الحجوزات",
  "summary.occupancy": "الإشغال",
  "summary.net": "الصافي",
  "summary.trend": "الاتجاه",

  "settings.title": "الإعدادات",
  "settings.subtitle": "إعدادات النظام والمعاملات الشهرية",
  "settings.general": "عام",
  "settings.generalSub": "تنطبق على جميع الأشهر",
  "settings.currency": "العملة",
  "settings.defaultRate": "سعر تحويل USD → {c}",
  "settings.defaultMgmt": "نسبة الإدارة الافتراضية (%)",
  "settings.rooms": "الغرف",
  "settings.roomsSub": "أضف أو احذف الغرف — تُحفظ حجوزات الغرف المحذوفة.",
  "settings.newRoom": "اسم الغرفة الجديدة",
  "settings.monthParams": "معاملات الشهر",
  "settings.monthParamsSub": "المصروفات وسعر الدولار ونسبة الإدارة لـ",
  "settings.expenses": "المصروفات ({c})",
  "settings.usdRate": "سعر الدولار",
  "settings.mgmt": "نسبة الإدارة (%)",
  "settings.danger": "منطقة الخطر",
  "settings.dangerSub": "إعادة تعيين كل البيانات إلى مثال يونيو 2026.",
  "settings.reset": "إعادة تعيين البيانات",
  "settings.resetConfirm": "هل تريد إعادة تعيين كل البيانات؟ لا يمكن التراجع.",

  "expenses.title": "تفاصيل المصروفات",
  "expenses.subtitle": "دوّن ما دفعته ولماذا — سيتم تحديث الإجمالي تلقائياً.",
  "expenses.description": "البيان",
  "expenses.amount": "المبلغ",
  "expenses.date": "التاريخ",
  "expenses.add": "إضافة مصروف",
  "expenses.placeholderLabel": "مثال: نظافة، مرافق، غسيل…",
  "expenses.empty": "لا توجد مصروفات مسجلة بعد.",
  "expenses.total": "إجمالي المصروفات",
  "expenses.autoTotal": "يُحسب من العناصر أدناه",

  "month.January": "يناير",
  "month.February": "فبراير",
  "month.March": "مارس",
  "month.April": "أبريل",
  "month.May": "مايو",
  "month.June": "يونيو",
  "month.July": "يوليو",
  "month.August": "أغسطس",
  "month.September": "سبتمبر",
  "month.October": "أكتوبر",
  "month.November": "نوفمبر",
  "month.December": "ديسمبر",
};

const dicts: Record<Lang, Dict> = { en, ar };
const KEY = "app-lang";

interface Ctx {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatMonthKey: (key: string) => string;
}

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY) as Lang | null;
      if (stored === "en" || stored === "ar") setLangState(stored);
    } catch { /* ignore */ }
  }, []);

  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", dir);
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback(() => setLang(lang === "en" ? "ar" : "en"), [lang, setLang]);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    let s = dicts[lang][key] ?? dicts.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }, [lang]);

  const formatMonthKey = useCallback((key: string) => {
    // key like "June 2026"
    const [name, year] = key.split(" ");
    const translated = dicts[lang][`month.${name}`] ?? name;
    return `${translated} ${year}`;
  }, [lang]);

  const value = useMemo<Ctx>(() => ({ lang, dir, setLang, toggle, t, formatMonthKey }), [lang, dir, setLang, toggle, t, formatMonthKey]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
