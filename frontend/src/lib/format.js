/**
 * Formatting helpers. The API speaks in paise (integer) and ISO dates; the UI speaks in rupees and
 * Indian date conventions. All conversion happens here so no component ever divides by 100 inline.
 */

const RUPEE = '₹';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrExact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plainNumber = new Intl.NumberFormat('en-IN');

/** 452300 -> "₹4,523". Rounds to whole rupees, which is how a round is actually discussed. */
export function money(paise) {
  const value = Number(paise || 0) / 100;
  return inr.format(Math.round(value));
}

/** 452345 -> "₹4,523.45". Used on invoices and receipts where the paise matter. */
export function moneyExact(paise) {
  return inrExact.format(Number(paise || 0) / 100);
}

/** Compact form for KPI tiles: ₹1.2L, ₹84.5k, ₹930. */
export function moneyShort(paise) {
  const rupees = Math.round(Number(paise || 0) / 100);
  const abs = Math.abs(rupees);
  if (abs >= 10000000) return `${RUPEE}${(rupees / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${RUPEE}${(rupees / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${RUPEE}${(rupees / 1000).toFixed(1)}k`;
  return `${RUPEE}${rupees}`;
}

export function count(value) {
  return plainNumber.format(Number(value || 0));
}

/** Metres -> "2.4 km" or "780 m". */
export function distance(metres) {
  const m = Number(metres || 0);
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function percent(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

/** "2026-08-29" -> "29 Aug". */
export function shortDate(iso) {
  const date = toDate(iso);
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** "2026-08-29" -> "Sat, 29 Aug 2026". */
export function longDate(iso) {
  const date = toDate(iso);
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "2026-08-29" -> "Sat, 29 Aug". */
export function weekdayDate(isoOrDate = new Date()) {
  const date = typeof isoOrDate === 'string' ? toDate(isoOrDate) : isoOrDate;
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

/** ISO instant -> "6:12 am". */
export function clock(instant) {
  if (!instant) return '—';
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '—';
  return date
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
}

/** Human relative day, because "yesterday" reads faster than a date on a busy screen. */
export function relativeDay(iso) {
  const date = toDate(iso);
  if (!date) return '—';
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  if (days === 1) return 'Tomorrow';
  if (days < 0 && days > -7) return `${Math.abs(days)} days ago`;
  if (days > 0 && days < 7) return `in ${days} days`;
  return shortDate(iso);
}

export function todayIso() {
  return isoDate(new Date());
}

export function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

/** Rupee string from a form input -> integer paise, tolerant of "1,250.50" and " 90 ". */
export function toPaise(input) {
  const cleaned = String(input ?? '').replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  return Math.round(Number.parseFloat(cleaned) * 100) || 0;
}

export function fromPaise(paise) {
  return (Number(paise || 0) / 100).toFixed(2);
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/** Bit 0 = Monday, matching the backend weekday mask. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function maskToDays(mask) {
  const value = Number(mask || 0);
  if (value === 127) return 'Every day';
  const picked = WEEKDAYS.filter((_, index) => (value & (1 << index)) !== 0);
  return picked.length ? picked.join(', ') : 'No days';
}

export function toggleMaskBit(mask, index) {
  return Number(mask || 0) ^ (1 << index);
}

function toDate(iso) {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (!Number.isNaN(date.getTime())) return date;
  const fallback = new Date(iso);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
