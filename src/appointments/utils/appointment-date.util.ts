import { WEEKDAY_LABELS } from '../constants/appointment-availability.contants';

export function toDateKey(value: string | Date | null | undefined): string {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  return String(value).substring(0, 10);
}

export function toTimeKey(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return String(value).substring(0, 5);
}

export function getWeekdayLabelFromDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const weekday = WEEKDAY_LABELS[date.getUTCDay()];

  if (!weekday) {
    return '';
  }

  return weekday;
}

export function hasAppointmentDateTimePassed(
  scheduledDate: string | Date,
  scheduledTime: string | null | undefined,
): boolean {
  const dateKey = toDateKey(scheduledDate);
  const timeKey = toTimeKey(scheduledTime);

  if (!dateKey || !timeKey) {
    return false;
  }

  const appointmentDateTime = new Date(`${dateKey}T${timeKey}:00`);
  const now = new Date();

  return appointmentDateTime <= now;
}
