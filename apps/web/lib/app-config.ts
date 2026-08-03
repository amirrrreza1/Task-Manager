export type Calendar = 'gregorian' | 'solar';

const calendarValue = process.env.NEXT_PUBLIC_CALENDAR?.trim().toLowerCase();
const companyNameValue = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim();
const companyIconValue = process.env.NEXT_PUBLIC_COMPANY_ICON?.trim();

export const calendar: Calendar = calendarValue === 'solar' ? 'solar' : 'gregorian';
export const companyName = companyNameValue || 'Task Manager';
export const companyIcon =
  companyIconValue && (/^https?:\/\//i.test(companyIconValue) || companyIconValue.startsWith('/'))
    ? companyIconValue
    : '/icon.svg';

const calendarLocale = 'en-US-u-ca-gregory';
const solarPartsLocale = 'en-US-u-ca-persian-nu-latn';

export const solarMonthNames = [
  'Farvardin',
  'Ordibehesht',
  'Khordad',
  'Tir',
  'Mordad',
  'Shahrivar',
  'Mehr',
  'Aban',
  'Azar',
  'Dey',
  'Bahman',
  'Esfand',
] as const;

export type SolarDateParts = { day: number; month: number; year: number };

function asDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

const solarPartsFormatter = new Intl.DateTimeFormat(solarPartsLocale, {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

/** Returns the Persian-calendar date while keeping the app's stored ISO date intact. */
export function getSolarDateParts(value: string | Date): SolarDateParts {
  const parts = solarPartsFormatter.formatToParts(asDate(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);

  return { day: part('day'), month: part('month'), year: part('year') };
}

function formatSolarDate(value: string | Date) {
  const { day, month, year } = getSolarDateParts(value);
  return `${day} ${solarMonthNames[month - 1]} ${year}`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return 'Not scheduled';

  if (calendar === 'solar') return formatSolarDate(value);

  return new Intl.DateTimeFormat(calendarLocale, { dateStyle: 'medium' }).format(asDate(value));
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return 'Not scheduled';

  if (calendar === 'solar') {
    return `${formatSolarDate(value)}, ${new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(asDate(value))}`;
  }

  return new Intl.DateTimeFormat(calendarLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(asDate(value));
}
