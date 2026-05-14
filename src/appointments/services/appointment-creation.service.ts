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

import { toDateKey, toTimeKey } from '../utils/appointment-date.util';
import { normalizeDay } from '../utils/appointment-time-slots.util';

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

      const normalizedDay = normalizeDay(dto.scheduledDay);

      const availableNormalized = (service.availableDays ?? []).map((day) =>
        normalizeDay(day),
      );

      if (!availableNormalized.includes(normalizedDay)) {
        throw new BadRequestException(
          'Dia solicitado não está disponível para este serviço.',
        );
      }

      const conflictingAppointment = await manager
        .getRepository(Appointment)
        .createQueryBuilder('appointment')
        .setLock('pessimistic_write')
        .where('appointment.serviceId = :serviceId', {
          serviceId: dto.serviceId,
        })
        .andWhere('appointment.scheduledDate = :scheduledDate', {
          scheduledDate,
        })
        .andWhere('appointment.scheduledTime = :scheduledTime', {
          scheduledTime,
        })
        .andWhere('appointment.status IN (:...busyStatuses)', {
          busyStatuses: BLOCKING_APPOINTMENT_STATUSES,
        })
        .getOne();

      if (conflictingAppointment) {
        throw new BadRequestException(
          'Já existe agendamento confirmado/pago para este dia, horário e serviço.',
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
