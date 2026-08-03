'use client';

import { Calendar } from '@appica/icons-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ChangeEventHandler,
} from 'react';
import { Select } from './design-system';
import {
  calendar,
  formatDate,
  getSolarDateParts,
  solarMonthNames,
  type SolarDateParts,
} from '../lib/app-config';

type CalendarDateInputProps = {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  disabled?: boolean;
  hidePastYears?: boolean;
  id?: string;
  'aria-label'?: string;
};

const pad = (value: number) => String(value).padStart(2, '0');
const gregorianMonthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function dateFromInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inputDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function solarToGregorian(year: number, month: number, day: number) {
  // Intl is also our rendering source, so this search keeps selected dates
  // exactly aligned with the browser's Persian-calendar implementation.
  const candidate = new Date(year + 621, 2, 15, 12);
  for (let offset = 0; offset < 380; offset += 1) {
    const parts = getSolarDateParts(candidate);
    if (parts.year === year && parts.month === month && parts.day === day)
      return new Date(candidate);
    candidate.setDate(candidate.getDate() + 1);
  }
  return null;
}

function daysInSolarMonth(year: number, month: number) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return solarToGregorian(year, month, 30) ? 30 : 29;
}

function getGregorianDateParts(date: Date): SolarDateParts {
  return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() };
}

function daysInGregorianMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function gregorianFromParts(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function inputChange(value: string): ChangeEvent<HTMLInputElement> {
  return {
    currentTarget: { value },
    target: { value },
  } as ChangeEvent<HTMLInputElement>;
}

/** A compact date picker that submits the API's ISO date values. */
export function CalendarDateInput({
  value,
  onChange,
  disabled,
  hidePastYears = false,
  id,
  'aria-label': ariaLabel,
}: CalendarDateInputProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerId = useId();
  const isSolar = calendar === 'solar';
  const parsedDate = dateFromInput(value);
  const current = isSolar
    ? getSolarDateParts(parsedDate ?? new Date())
    : getGregorianDateParts(parsedDate ?? new Date());
  const currentYear = isSolar
    ? getSolarDateParts(new Date()).year
    : getGregorianDateParts(new Date()).year;
  const selected = value ? current : null;
  const yearStart = hidePastYears
    ? currentYear
    : Math.min(isSolar ? 1350 : 1900, current.year - 15);
  const yearEnd = currentYear + 3;
  const monthNames = isSolar ? solarMonthNames : gregorianMonthNames;
  const daysInMonth = (year: number, month: number) =>
    isSolar ? daysInSolarMonth(year, month) : daysInGregorianMonth(year, month);
  const dateFromParts = (year: number, month: number, day: number) =>
    isSolar ? solarToGregorian(year, month, day) : gregorianFromParts(year, month, day);

  function update(next: Partial<SolarDateParts>) {
    const year = next.year ?? current.year;
    const month = next.month ?? current.month;
    const day = Math.min(next.day ?? current.day, daysInMonth(year, month));
    const gregorian = dateFromParts(year, month, day);
    if (!gregorian) return;

    const dateValue = inputDateValue(gregorian);
    onChange(inputChange(dateValue));
  }

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Element | null;
      // Appica Select options are rendered in a portal, outside this container.
      // Treat those options as part of this picker so choosing one does not
      // unmount the menu before the select's value-change handler can run.
      const isPickerSelectOption = Boolean(target?.closest('[data-slot="select-content"]'));
      if (!containerRef.current?.contains(event.target as Node) && !isPickerSelectOption) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div className="calendar-date-input" ref={containerRef}>
      <button
        aria-controls={pickerId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className="calendar-date-input__trigger"
        disabled={disabled}
        id={id}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        type="button"
      >
        <span>{selected ? formatDate(parsedDate) : 'Select date'}</span>
        <Calendar aria-hidden="true" className="calendar-date-input__icon" />
      </button>
      {open ? (
        <div
          aria-label={`${ariaLabel ?? 'Date'} picker`}
          className="calendar-date-input__menu"
          id={pickerId}
          role="dialog"
        >
          <Select
            aria-label="Month"
            disabled={disabled}
            onChange={(event) => update({ month: Number(event.target.value) })}
            value={selected ? String(selected.month) : ''}
          >
            <option value="" disabled>
              Month
            </option>
            {monthNames.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Day"
            disabled={disabled}
            onChange={(event) => update({ day: Number(event.target.value) })}
            value={selected ? String(selected.day) : ''}
          >
            <option value="" disabled>
              Day
            </option>
            {Array.from(
              { length: daysInMonth(current.year, current.month) },
              (_, index) => index + 1,
            ).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Year"
            disabled={disabled}
            onChange={(event) => update({ year: Number(event.target.value) })}
            value={selected ? String(selected.year) : ''}
          >
            <option value="" disabled>
              Year
            </option>
            {Array.from({ length: yearEnd - yearStart + 1 }, (_, index) => yearEnd - index).map(
              (year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ),
            )}
          </Select>
        </div>
      ) : null}
    </div>
  );
}
