import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Appointment } from '../entities/appointment.entity';

import { UpdateAppointmentStatusDto } from '../dto/update-appointment-status.dto';

import {
  hasAppointmentDateTimePassed,
  toDateKey,
  toTimeKey,
} from '../utils/appointment-date.util';

import { AppointmentQueryService } from './appointment-query.service';
import { AppointmentNotificationService } from './appointment-notification.service';
import {
  BLOCKING_APPOINTMENT_STATUSES,
  CUSTOMER_CANCELLABLE_STATUSES,
  VALID_APPOINTMENT_TRANSITIONS,
} from '../constants/appointment-status.contants';

@Injectable()
export class AppointmentStatusService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,

    private readonly appointmentQueryService: AppointmentQueryService,
    private readonly notificationService: AppointmentNotificationService,
  ) {}

  async updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
    requesterId: string,
  ): Promise<Appointment> {
    const appointment = await this.appointmentQueryService.findOne(id);

    const isProvider = appointment.service?.provider?.id === requesterId;

    if (!isProvider) {
      throw new ForbiddenException(
        'Apenas o provider pode alterar o status desta operação.',
      );
    }

    const currentStatus = appointment.status;
    const nextStatus = dto.status;

    if (!VALID_APPOINTMENT_TRANSITIONS[currentStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `Transição de status inválida: ${currentStatus} para ${nextStatus}.`,
      );
    }

    if (nextStatus === 'confirmed') {
      const scheduledTime = toTimeKey(appointment.scheduledTime);

      if (!scheduledTime) {
        throw new BadRequestException(
          'Não é possível confirmar um agendamento sem horário definido.',
        );
      }

      await this.assertNoServiceTimeConflict(
        appointment.serviceId,
        appointment.scheduledDate,
        scheduledTime,
        appointment.id,
      );
    }

    if (nextStatus === 'completed') {
      const hasPassed = hasAppointmentDateTimePassed(
        appointment.scheduledDate,
        appointment.scheduledTime,
      );

      if (!hasPassed) {
        throw new BadRequestException(
          'Só é possível concluir o agendamento após o horário agendado.',
        );
      }
    }

    appointment.status = nextStatus;

    const saved = await this.appointmentsRepo.save(appointment);

    await this.notificationService.publishAppointmentStatusChanged(
      saved,
      'provider',
    );

    return saved;
  }

  async cancelByCustomer(
    id: string,
    requesterId: string,
  ): Promise<Appointment> {
    const appointment = await this.appointmentQueryService.findOne(id);

    if (appointment.customerId !== requesterId) {
      throw new ForbiddenException(
        'Apenas o solicitante do agendamento pode cancelá-lo.',
      );
    }

    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        `Não é possível cancelar um agendamento com status "${appointment.status}". ` +
          `Após o pagamento confirmado o cancelamento deve ser tratado diretamente com o prestador.`,
      );
    }

    appointment.status = 'cancelled';

    const saved = await this.appointmentsRepo.save(appointment);

    await this.notificationService.publishAppointmentStatusChanged(
      saved,
      'customer',
    );

    return saved;
  }

  private async assertNoServiceTimeConflict(
    serviceId: string,
    scheduledDate: string | Date,
    scheduledTime: string,
    exceptAppointmentId?: string,
  ): Promise<void> {
    const scheduledDateKey = toDateKey(scheduledDate);
    const scheduledTimeKey = toTimeKey(scheduledTime);

    if (!scheduledDateKey) {
      throw new BadRequestException('Data do agendamento é obrigatória.');
    }

    if (!scheduledTimeKey) {
      throw new BadRequestException('Horário do agendamento é obrigatório.');
    }

    const conflicting = await this.appointmentsRepo
      .createQueryBuilder('appointment')
      .where('appointment.serviceId = :serviceId', { serviceId })
      .andWhere('appointment.scheduledDate = :scheduledDate', {
        scheduledDate: scheduledDateKey,
      })
      .andWhere('appointment.scheduledTime = :scheduledTime', {
        scheduledTime: scheduledTimeKey,
      })
      .andWhere('appointment.status IN (:...busyStatuses)', {
        busyStatuses: BLOCKING_APPOINTMENT_STATUSES,
      })
      .andWhere(exceptAppointmentId ? 'appointment.id != :id' : '1=1', {
        id: exceptAppointmentId,
      })
      .getOne();

    if (conflicting) {
      throw new BadRequestException(
        'Conflito de agenda: já existe agendamento ativo para esta data, horário e serviço.',
      );
    }
  }
}
