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

const calendarLocale = calendar === 'solar' ? 'fa-IR-u-ca-persian' : 'en-US-u-ca-gregory';

function asDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return 'Not scheduled';

  return new Intl.DateTimeFormat(calendarLocale, { dateStyle: 'medium' }).format(asDate(value));
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return 'Not scheduled';

  return new Intl.DateTimeFormat(calendarLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(asDate(value));
}
