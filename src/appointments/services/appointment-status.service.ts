import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Appointment } from '../entities/appointment.entity';
import { Payment } from '../entities/payment.entity';
import type { IPaymentGateway } from '../payment/payment-gateway.interface';

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

    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,

    private readonly appointmentQueryService: AppointmentQueryService,
    private readonly notificationService: AppointmentNotificationService,

    @Inject('PAYMENT_GATEWAY')
    private readonly paymentGateway: IPaymentGateway,
  ) {}

  private readonly logger = new Logger(AppointmentStatusService.name);

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

    await this.notificationService.publishAppointmentStatusChanged(saved);

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

    const estaPago = appointment.status === 'paid';

    if (
      !estaPago &&
      !CUSTOMER_CANCELLABLE_STATUSES.includes(appointment.status)
    ) {
      throw new BadRequestException(
        `Não é possível cancelar um agendamento com status "${appointment.status}".`,
      );
    }

    if (estaPago) {
      // A régua é o horário do agendamento. Depois dele o serviço pode ter
      // sido prestado, e devolver automaticamente puniria o prestador.
      if (
        hasAppointmentDateTimePassed(
          appointment.scheduledDate,
          appointment.scheduledTime,
        )
      ) {
        throw new BadRequestException(
          'O horário deste agendamento já passou. O cancelamento precisa ser ' +
            'tratado diretamente com o prestador.',
        );
      }

      // Estornar ANTES de cancelar. Se o provedor recusar, o agendamento
      // permanece pago — cancelar primeiro criaria agendamento cancelado com
      // o dinheiro retido, que é justamente o problema a resolver.
      await this.estornarPagamento(appointment.id);
    }

    appointment.status = 'cancelled';

    const saved = await this.appointmentsRepo.save(appointment);

    await this.notificationService.publishAppointmentStatusChanged(saved);

    return saved;
  }

  /**
   * Solicita o estorno do pagamento confirmado do agendamento.
   *
   * Marca o pagamento como estornado só depois de o provedor aceitar o
   * pedido. A liquidação efetiva leva dias e chega por webhook — aqui basta
   * saber que o pedido foi aceito.
   */
  private async estornarPagamento(appointmentId: string): Promise<void> {
    const pagamento = await this.paymentsRepo.findOne({
      where: { appointmentId, status: 'paid' },
    });

    if (!pagamento) {
      throw new BadRequestException(
        'Não foi encontrado um pagamento confirmado para este agendamento.',
      );
    }

    try {
      const estorno = await this.paymentGateway.refundPayment(
        pagamento.externalPaymentId,
      );

      pagamento.status = 'refunded';
      await this.paymentsRepo.save(pagamento);

      this.logger.log(
        `Estorno ${estorno.refundId} solicitado para o agendamento ${appointmentId}`,
      );
    } catch (err) {
      this.logger.error(
        `Falha ao estornar o agendamento ${appointmentId}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Não foi possível processar o estorno agora. O agendamento continua ' +
          'ativo — tente novamente em instantes.',
      );
    }
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
