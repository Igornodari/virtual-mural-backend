import { Service } from '../../services/entities/service.entity';
import { DEFAULT_SERVICE_TIME_SLOTS } from '../constants/appointment-availability.contants';
import { AvailabilitySlotLike } from '../types/appointment.type';

export function normalizeDay(day: string): string {
  return day.trim().toLowerCase();
}

export function generateHourlySlots(
  startTime: string,
  endTime: string,
): string[] {
  const startHour = Number(startTime.substring(0, 2));
  const endHour = Number(endTime.substring(0, 2));

  if (Number.isNaN(startHour) || Number.isNaN(endHour) || startHour > endHour) {
    return [];
  }

  const slots: string[] = [];

  for (let hour = startHour; hour <= endHour; hour++) {
    slots.push(`${String(hour).padStart(2, '0')}:00`);
  }

  return slots;
}

export function resolveTimeSlotsForDay(
  service: Service,
  dayLabel: string,
): string[] {
  const serviceWithAvailability = service as Service & {
    availabilitySlots?: AvailabilitySlotLike[];
  };

  const availabilitySlots = serviceWithAvailability.availabilitySlots ?? [];

  if (!availabilitySlots.length) {
    return [...DEFAULT_SERVICE_TIME_SLOTS];
  }

  const normalizedDay = normalizeDay(dayLabel);

  const matchingSlots = availabilitySlots.filter((slot) => {
    if (!slot.day) {
      return false;
    }

    return normalizeDay(slot.day) === normalizedDay;
  });

  if (!matchingSlots.length) {
    return [...DEFAULT_SERVICE_TIME_SLOTS];
  }

  const slots = new Set<string>();

  for (const slot of matchingSlots) {
    if (!slot.startTime || !slot.endTime) {
      continue;
    }

    for (const time of generateHourlySlots(slot.startTime, slot.endTime)) {
      slots.add(time);
    }
  }

  return slots.size
    ? Array.from(slots).sort()
    : [...DEFAULT_SERVICE_TIME_SLOTS];
}
