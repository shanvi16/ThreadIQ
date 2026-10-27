const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN');

/** Whole rupees for dashboards. */
export const money = (n: number) => inr.format(n);
/** Rupees and paise, for prices and sale totals. */
export const moneyExact = (n: number) => inrExact.format(n);
export const number = (n: number) => num.format(n);

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso: string | Date) => dateFmt.format(new Date(iso));
export const formatDateTime = (iso: string | Date) => dateTimeFmt.format(new Date(iso));

/** 'YYYY-MM-DD' (UTC) as 'DD Mon' for chart axes. */
export const shortDay = (ymd: string) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`));

export const percent = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
