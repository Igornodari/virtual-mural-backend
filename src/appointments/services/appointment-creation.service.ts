import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Appointment } from '../entities/appointment.entity';
import { Service } from '../../services/entities/service.entity';
import { User } from '../../users/entities/user.entity';

import { CreateAppointmentDto } from '../dto/create-appointment.dto';

import {
  hasAppointmentDateTimePassed,
  toDateKey,
  toTimeKey,
} from '../utils/appointment-date.util';
import {
  getServiceStepMinutes,
  isSlotBlockedByConfirmed,
  normalizeDay,
} from '../utils/appointment-time-slots.util';

import { AppointmentNotificationService } from './appointment-notification.service';
import { BLOCKING_APPOINTMENT_STATUSES } from '../constants/appointment-status.contants';

@Injectable()
export class AppointmentCreationService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,

    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,

    private readonly notificationService: AppointmentNotificationService,
  ) {}

  async create(
    dto: CreateAppointmentDto,
    customer: User,
  ): Promise<Appointment> {
    if (!customer.condominiumId) {
      throw new ForbiddenException(
        'Apenas moradores vinculados a um condomínio podem solicitar agendamentos.',
      );
    }

    const scheduledDate = toDateKey(dto.scheduledDate);
    const scheduledTime = toTimeKey(dto.scheduledTime ?? null);

    if (!scheduledDate) {
      throw new BadRequestException('Data do agendamento é obrigatória.');
    }

    if (!scheduledTime) {
      throw new BadRequestException('Horário do agendamento é obrigatório.');
    }

    // Antes de abrir transação: recusar horário que já passou. A função já
    // existia no util e era usada por disponibilidade e status, mas não aqui.
    if (hasAppointmentDateTimePassed(scheduledDate, scheduledTime)) {
      throw new BadRequestException(
        'Não é possível agendar para uma data e horário que já passaram.',
      );
    }

    return this.appointmentsRepo.manager.transaction(async (manager) => {
      const service = await manager.getRepository(Service).findOne({
        where: { id: dto.serviceId },
      });

      if (!service) {
        throw new NotFoundException(`Serviço ${dto.serviceId} não encontrado.`);
      }

      if (!service.isActive) {
        throw new BadRequestException('Serviço inativo não pode ser agendado.');
      }

      if (service.providerId === customer.id) {
        throw new ForbiddenException(
          'Você não pode agendar seu próprio serviço.',
        );
      }

      // Fronteira do condomínio: o mural é do prédio. Ter um condomínio não
      // basta — precisa ser o mesmo do serviço.
      if (
        !service.condominiumId ||
        service.condominiumId !== customer.condominiumId
      ) {
        throw new ForbiddenException(
          'Este serviço não pertence ao seu condomínio.',
        );
      }

      const normalizedDay = normalizeDay(dto.scheduledDay);

      const availableNormalized = (service.availableDays ?? []).map((day) =>
        normalizeDay(day),
      );

      if (!availableNormalized.includes(normalizedDay)) {
        throw new BadRequestException(
          'Dia solicitado não está disponível para este serviço.',
        );
      }

      // Carrega TODOS os confirmados do dia (com lock) e rejeita se o intervalo
      // do novo agendamento (duração + pausa) se sobrepõe a algum deles. Antes
      // o bloqueio era só do horário exato, o que permitia atendimentos colados.
      const confirmedSameDay = await manager
        .getRepository(Appointment)
        .createQueryBuilder('appointment')
        .setLock('pessimistic_write')
        .where('appointment.serviceId = :serviceId', {
          serviceId: dto.serviceId,
        })
        .andWhere('appointment.scheduledDate = :scheduledDate', {
          scheduledDate,
        })
        .andWhere('appointment.scheduledTime IS NOT NULL')
        .andWhere('appointment.status IN (:...busyStatuses)', {
          busyStatuses: BLOCKING_APPOINTMENT_STATUSES,
        })
        .getMany();

      const confirmedTimes = confirmedSameDay
        .map((appt) => toTimeKey(appt.scheduledTime))
        .filter((time): time is string => !!time);

      const stepMinutes = getServiceStepMinutes(service);

      if (
        isSlotBlockedByConfirmed(scheduledTime, confirmedTimes, stepMinutes)
      ) {
        throw new BadRequestException(
          'Já existe agendamento em horário conflitante para este serviço (considerando a duração e a pausa configuradas).',
        );
      }

      const appointment = manager.getRepository(Appointment).create({
        ...dto,
        scheduledDate,
        scheduledTime,
        customerId: customer.id,
        status: 'pending',
      });

      const saved = await manager.getRepository(Appointment).save(appointment);

      const serviceWithProvider = await manager.getRepository(Service).findOne({
        where: { id: dto.serviceId },
        relations: ['provider'],
      });

      await this.notificationService.publishAppointmentRequested({
        appointment: saved,
        customer,
        service: serviceWithProvider,
      });

      return saved;
    });
  }
}
