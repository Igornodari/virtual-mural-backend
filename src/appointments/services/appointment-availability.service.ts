import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Appointment } from '../entities/appointment.entity';
import { Service } from '../../services/entities/service.entity';
import { User } from '../../users/entities/user.entity';
import {
  getWeekdayLabelFromDateKey,
  toDateKey,
  toTimeKey,
} from '../utils/appointment-date.util';

import {
  getServiceStepMinutes,
  isSlotBlockedByConfirmed,
  resolveTimeSlotsForDay,
} from '../utils/appointment-time-slots.util';
import { AppointmentQueryService } from './appointment-query.service';
import { DEFAULT_SERVICE_TIME_SLOTS } from '../constants/appointment-availability.contants';
import { BLOCKING_APPOINTMENT_STATUSES } from '../constants/appointment-status.contants';
import {
  ServiceAvailabilityResponse,
  BlockedSlot,
  AppointmentBlockedSlotRow,
} from '../types/appointment.type';

@Injectable()
export class AppointmentAvailabilityService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,

    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,

    private readonly appointmentQueryService: AppointmentQueryService,
  ) {}

  async findByService(
    serviceId: string,
    requester: User,
  ): Promise<Appointment[] | ServiceAvailabilityResponse> {
    const service = await this.servicesRepo.findOne({
      where: { id: serviceId },
      relations: ['provider'],
    });

    if (!service) {
      throw new NotFoundException(`Serviço ${serviceId} não encontrado.`);
    }

    if (service.providerId === requester.id) {
      return this.appointmentQueryService.findByServiceRaw(serviceId);
    }

    if (
      requester.condominiumId &&
      requester.condominiumId === service.condominiumId
    ) {
      const confirmedSlots = await this.findServiceBlockedSlots(serviceId);

      const { blockedDates, blockedSlots } = this.expandBlockedIntervals(
        service,
        confirmedSlots,
      );

      return {
        serviceId,
        timeSlots: [...DEFAULT_SERVICE_TIME_SLOTS],
        blockedDates,
        blockedSlots,
      };
    }

    throw new ForbiddenException(
      'Apenas moradores do mesmo condomínio podem acessar este recurso.',
    );
  }

  async findServiceBlockedSlots(serviceId: string): Promise<BlockedSlot[]> {
    const rows = await this.appointmentsRepo
      .createQueryBuilder('appointment')
      .select('appointment.scheduledDate', 'scheduledDate')
      .addSelect('appointment.scheduledTime', 'scheduledTime')
      .where('appointment.serviceId = :serviceId', { serviceId })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: BLOCKING_APPOINTMENT_STATUSES,
      })
      .andWhere('appointment.scheduledTime IS NOT NULL')
      .groupBy('appointment.scheduledDate')
      .addGroupBy('appointment.scheduledTime')
      .getRawMany<AppointmentBlockedSlotRow>();

    return rows
      .map((row) => ({
        date: toDateKey(row.scheduledDate),
        time: toTimeKey(row.scheduledTime),
      }))
      .filter((slot): slot is BlockedSlot => !!slot.date && !!slot.time);
  }

  /**
   * Expande cada agendamento confirmado para o INTERVALO ocupado
   * (duração + pausa). Para cada data, marca como bloqueado todo slot da
   * grade do dia que se sobrepõe a um horário confirmado. Se TODOS os slots
   * do dia ficam bloqueados, marca o dia inteiro (time = null).
   *
   * É aqui que mora a regra "um confirmado às 09:00 ocupa 09:00–12:00":
   * o front recebe os slots já filtrados e não precisa conhecer a regra.
   */
  private expandBlockedIntervals(
    service: Service,
    confirmedSlots: BlockedSlot[],
  ): { blockedDates: string[]; blockedSlots: BlockedSlot[] } {
    const stepMinutes = getServiceStepMinutes(service);

    const confirmedByDate = new Map<string, string[]>();
    for (const slot of confirmedSlots) {
      if (!slot.date || !slot.time) {
        continue;
      }
      const list = confirmedByDate.get(slot.date) ?? [];
      list.push(slot.time);
      confirmedByDate.set(slot.date, list);
    }

    const blockedDates: string[] = [];
    const blockedSlots: BlockedSlot[] = [];

    for (const [date, confirmedTimes] of Array.from(
      confirmedByDate.entries(),
    )) {
      const dayLabel = getWeekdayLabelFromDateKey(date);
      const grid = resolveTimeSlotsForDay(service, dayLabel);

      if (!grid.length) {
        continue;
      }

      const blockedForDay = grid.filter((slotTime) =>
        isSlotBlockedByConfirmed(slotTime, confirmedTimes, stepMinutes),
      );

      if (blockedForDay.length === grid.length) {
        blockedDates.push(date);
        blockedSlots.push({ date, time: null });
        continue;
      }

      for (const slotTime of blockedForDay) {
        blockedSlots.push({ date, time: slotTime });
      }
    }

    return { blockedDates, blockedSlots };
  }
}
