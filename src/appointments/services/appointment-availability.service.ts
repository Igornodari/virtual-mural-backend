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

import { resolveTimeSlotsForDay } from '../utils/appointment-time-slots.util';
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
      const blockedTimeSlots = await this.findServiceBlockedSlots(serviceId);

      const blockedDates = this.buildBlockedDates(service, blockedTimeSlots);

      const blockedSlots = this.appendFullDayBlocks(
        blockedTimeSlots,
        blockedDates,
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

  private buildBlockedDates(
    service: Service,
    blockedSlots: BlockedSlot[],
  ): string[] {
    const groupedByDate = new Map<string, Set<string>>();

    for (const slot of blockedSlots) {
      if (!slot.date || !slot.time) {
        continue;
      }

      if (!groupedByDate.has(slot.date)) {
        groupedByDate.set(slot.date, new Set<string>());
      }

      groupedByDate.get(slot.date)!.add(slot.time);
    }

    return Array.from(groupedByDate.entries())
      .filter(([date, blockedTimes]) => {
        const dayLabel = getWeekdayLabelFromDateKey(date);
        const availableTimesForDay = resolveTimeSlotsForDay(service, dayLabel);

        return (
          availableTimesForDay.length > 0 &&
          availableTimesForDay.every((time) => blockedTimes.has(time))
        );
      })
      .map(([date]) => date);
  }

  private appendFullDayBlocks(
    blockedSlots: BlockedSlot[],
    blockedDates: string[],
  ): BlockedSlot[] {
    const result = [...blockedSlots];

    for (const date of blockedDates) {
      const alreadyExists = result.some(
        (slot) => slot.date === date && slot.time === null,
      );

      if (!alreadyExists) {
        result.push({
          date,
          time: null,
        });
      }
    }

    return result;
  }
}
