import { Service } from '../../services/entities/service.entity';
import { DEFAULT_SERVICE_TIME_SLOTS } from '../constants/appointment-availability.contants';
import { AvailabilitySlotLike } from '../types/appointment.type';

/** Duração padrão de um atendimento (min) quando o serviço não define. */
export const DEFAULT_DURATION_MINUTES = 60;
/** Pausa padrão entre atendimentos (min) quando o serviço não define. */
export const DEFAULT_BREAK_MINUTES = 0;

export function normalizeDay(day: string): string {
  return day.trim().toLowerCase();
}

/** 'HH:mm' -> minutos desde 00:00. Retorna NaN se inválido. */
export function timeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})/.exec(time ?? '');
  if (!match) {
    return NaN;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return NaN;
  }
  return hours * 60 + minutes;
}

/** minutos -> 'HH:mm'. */
export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Mantida por compatibilidade: slots de 1 em 1 hora, INCLUINDO a hora final.
 * Ex.: ('09:00','12:00') -> 09:00,10:00,11:00,12:00.
 */
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

/**
 * Gera horários de INÍCIO entre `startTime` e `endTime` (inclusive) com passo
 * de `stepMinutes`. O horário final conta como possível início.
 * Ex.: ('09:00','18:00', 180) -> 09:00, 12:00, 15:00, 18:00.
 */
export function generateSteppedSlots(
  startTime: string,
  endTime: string,
  stepMinutes: number,
): string[] {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start > end ||
    !Number.isFinite(stepMinutes) ||
    stepMinutes < 1
  ) {
    return [];
  }

  const slots: string[] = [];
  for (let current = start; current <= end; current += stepMinutes) {
    slots.push(minutesToTime(current));
  }

  return slots;
}

/**
 * Passo total da grade do serviço = duração + pausa, com fallbacks seguros
 * (serviços antigos: 60 + 0 = 60, equivalente ao comportamento anterior).
 */
export function getServiceStepMinutes(
  service: Pick<
    Service,
    'durationMinutes' | 'breakBetweenAppointmentsMinutes'
  >,
): number {
  const duration =
    Number(service?.durationMinutes) > 0
      ? Number(service.durationMinutes)
      : DEFAULT_DURATION_MINUTES;

  const breakMinutes =
    Number(service?.breakBetweenAppointmentsMinutes) >= 0
      ? Number(service.breakBetweenAppointmentsMinutes)
      : DEFAULT_BREAK_MINUTES;

  return Math.max(1, duration + breakMinutes);
}

/**
 * Verdadeiro se o intervalo do slot candidato [slot, slot+step) se sobrepõe
 * ao intervalo ocupado por algum horário confirmado [conf, conf+step).
 * Para intervalos de mesmo tamanho `step`, há sobreposição sse |slot-conf| < step.
 */
export function isSlotBlockedByConfirmed(
  slotTime: string,
  confirmedTimes: string[],
  stepMinutes: number,
): boolean {
  const slot = timeToMinutes(slotTime);
  if (Number.isNaN(slot) || stepMinutes < 1) {
    return false;
  }

  return confirmedTimes.some((confirmed) => {
    const conf = timeToMinutes(confirmed);
    return !Number.isNaN(conf) && Math.abs(slot - conf) < stepMinutes;
  });
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

  const stepMinutes = getServiceStepMinutes(service);
  const slots = new Set<string>();

  for (const slot of matchingSlots) {
    if (!slot.startTime || !slot.endTime) {
      continue;
    }

    for (const time of generateSteppedSlots(
      slot.startTime,
      slot.endTime,
      stepMinutes,
    )) {
      slots.add(time);
    }
  }

  return slots.size
    ? Array.from(slots).sort()
    : [...DEFAULT_SERVICE_TIME_SLOTS];
}
