import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from './entities/appointment.entity';
import { Payment } from './entities/payment.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { CreateAppointmentPaymentDto } from './dto/create-appointment-payment.dto';
import { User } from '../users/entities/user.entity';
import { Service } from '../services/entities/service.entity';
import { MessagingService } from '../messaging/messaging.service';
import { MuralEvents } from '../messaging/events/mural.events';
import { Inject } from '@nestjs/common';
import type { IPaymentGateway } from './payment/payment-gateway.interface';

const CUSTOMER_ONLY_STATUSES: AppointmentStatus[] = [
  'confirmed',
  'awaiting_payment',
  'paid',
  'completed',
];

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,
    private readonly messagingService: MessagingService,
    @Inject('PAYMENT_GATEWAY') private readonly paymentGateway: IPaymentGateway,
  ) {}

  private normalizeDay(day: string): string {
    return day.trim().toLowerCase();
  }

  async create(
    dto: CreateAppointmentDto,
    customer: User,
  ): Promise<Appointment> {
    if (customer.roleInCondominium !== 'customer') {
      throw new ForbiddenException(
        'Apenas customers podem solicitar agendamentos.',
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

      const normalizedDay = this.normalizeDay(dto.scheduledDay);
      const availableNormalized = service.availableDays.map((day) =>
        this.normalizeDay(day),
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
          scheduledDate: dto.scheduledDate,
        })
        .andWhere('appointment.status IN (:...busyStatuses)', {
          busyStatuses: CUSTOMER_ONLY_STATUSES,
        })
        .getOne();

      if (conflictingAppointment) {
        throw new BadRequestException(
          'Já existe agendamento confirmado/pago/concluído para este dia e serviço.',
        );
      }

      const appointment = manager.getRepository(Appointment).create({
        ...dto,
        customerId: customer.id,
        status: 'pending',
      });

      const saved = await manager.getRepository(Appointment).save(appointment);

      const serviceWithProvider = await manager.getRepository(Service).findOne({
        where: { id: dto.serviceId },
        relations: ['provider'],
      });

      await this.messagingService.publish(MuralEvents.APPOINTMENT_REQUESTED, {
        appointmentId: saved.id,
        serviceId: saved.serviceId,
        serviceName: serviceWithProvider?.name || '',
        customerId: customer.id,
        customerName: customer.displayName ?? customer.email,
        providerEmail: serviceWithProvider?.provider?.email ?? '',
        providerName:
          serviceWithProvider?.provider?.displayName ??
          serviceWithProvider?.provider?.email ??
          '',
        scheduledDate: saved.scheduledDate,
        scheduledDay: saved.scheduledDay,
      });

      return saved;
    });
  }

  async findByCustomer(customerId: string): Promise<Appointment[]> {
    return this.appointmentsRepo.find({
      where: { customerId },
      relations: ['service', 'service.provider'],
      order: { scheduledDate: 'DESC' },
    });
  }

  async handleStripeCheckoutSessionCompleted(params: {
    appointmentId: string;
    sessionId: string;
  }): Promise<void> {
    await this.appointmentsRepo.manager.transaction(async (manager) => {
      const appointment = await manager.getRepository(Appointment).findOne({
        where: { id: params.appointmentId },
      });

      if (!appointment) {
        this.logger.warn(
          `[handleStripeCheckoutSessionCompleted] Appointment ${params.appointmentId} não encontrado`,
        );
        return;
      }

      const payment = await manager.getRepository(Payment).findOne({
        where: { appointmentId: params.appointmentId },
        order: { createdAt: 'DESC' },
      });

      if (!payment) {
        this.logger.warn(
          `[handleStripeCheckoutSessionCompleted] Payment do appointment ${params.appointmentId} não encontrado`,
        );
        return;
      }

      payment.status = 'paid';
      payment.externalPaymentId = params.sessionId;
      await manager.getRepository(Payment).save(payment);

      appointment.status = 'paid';
      await manager.getRepository(Appointment).save(appointment);

      this.logger.log(
        `[handleStripeCheckoutSessionCompleted] appointment=${appointment.id} marcado como paid`,
      );
    });
  }

  async handleStripeCheckoutSessionExpired(params: {
    appointmentId: string;
    sessionId: string;
  }): Promise<void> {
    await this.appointmentsRepo.manager.transaction(async (manager) => {
      const payment = await manager.getRepository(Payment).findOne({
        where: { appointmentId: params.appointmentId },
        order: { createdAt: 'DESC' },
      });

      if (payment && payment.status !== 'paid') {
        payment.status = 'failed';
        payment.externalPaymentId = params.sessionId;
        await manager.getRepository(Payment).save(payment);
      }

      const appointment = await manager.getRepository(Appointment).findOne({
        where: { id: params.appointmentId },
      });

      if (appointment && appointment.status === 'awaiting_payment') {
        appointment.status = 'confirmed';
        await manager.getRepository(Appointment).save(appointment);
      }

      this.logger.log(
        `[handleStripeCheckoutSessionExpired] appointment=${params.appointmentId} sessão expirada`,
      );
    });
  }

  async findByProvider(providerId: string): Promise<Appointment[]> {
    return this.appointmentsRepo
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.service', 'service')
      .leftJoinAndSelect('service.provider', 'provider')
      .leftJoinAndSelect('appointment.customer', 'customer')
      .where('service.providerId = :providerId', { providerId })
      .orderBy('appointment.scheduledDate', 'DESC')
      .getMany();
  }

  async findByServiceRaw(serviceId: string): Promise<Appointment[]> {
    return this.appointmentsRepo.find({
      where: { serviceId },
      relations: ['customer'],
      order: { scheduledDate: 'ASC' },
    });
  }

  async findByService(
    serviceId: string,
    requester: User,
  ): Promise<Appointment[] | { serviceId: string; blockedDates: string[] }> {
    const service = await this.servicesRepo.findOne({
      where: { id: serviceId },
      relations: ['provider'],
    });

    if (!service) {
      throw new NotFoundException(`Serviço ${serviceId} não encontrado.`);
    }

    if (service.providerId === requester.id) {
      return this.findByServiceRaw(serviceId);
    }

    if (requester.roleInCondominium === 'customer') {
      const blockedDates = await this.findServiceBlockedDays(serviceId);
      return { serviceId, blockedDates };
    }

    throw new ForbiddenException(
      'Apenas cliente ou provider podem acessar este recurso.',
    );
  }

  private async assertNoServiceDayConflict(
    serviceId: string,
    scheduledDate: string | Date,
    exceptAppointmentId?: string,
  ) {
    const conflicting = await this.appointmentsRepo
      .createQueryBuilder('appointment')
      .where('appointment.serviceId = :serviceId', { serviceId })
      .andWhere('appointment.scheduledDate = :scheduledDate', { scheduledDate })
      .andWhere('appointment.status IN (:...busyStatuses)', {
        busyStatuses: ['confirmed', 'awaiting_payment', 'paid', 'completed'],
      })
      .andWhere(exceptAppointmentId ? 'appointment.id != :id' : '1=1', {
        id: exceptAppointmentId,
      })
      .getOne();

    if (conflicting) {
      throw new BadRequestException(
        'Conflito de agenda: já existe agendamento ativo para esta data e serviço.',
      );
    }
  }

  async findServiceBlockedDays(serviceId: string): Promise<string[]> {
    const statuses = ['confirmed', 'awaiting_payment', 'paid', 'completed'];
    const rows = await this.appointmentsRepo
      .createQueryBuilder('appointment')
      .select('appointment.scheduledDate', 'scheduledDate')
      .where('appointment.serviceId = :serviceId', { serviceId })
      .andWhere('appointment.status IN (:...statuses)', { statuses })
      .groupBy('appointment.scheduledDate')
      .getRawMany<{ scheduledDate: string }>();

    return rows.map((r) => r.scheduledDate);
  }

  async findOne(id: string): Promise<Appointment> {
    const appointment = await this.appointmentsRepo.findOne({
      where: { id },
      relations: ['service', 'service.provider', 'customer'],
    });
    if (!appointment) {
      throw new NotFoundException(`Agendamento ${id} não encontrado.`);
    }
    return appointment;
  }

  async updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
    requesterId: string,
  ): Promise<Appointment> {
    const appointment = await this.findOne(id);
    const isProvider = appointment.service?.provider?.id === requesterId;

    if (!isProvider) {
      throw new ForbiddenException(
        'Apenas o provider pode alterar o status desta operação.',
      );
    }

    const currentStatus = appointment.status;
    const nextStatus = dto.status;

    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['cancelled'],
      awaiting_payment: [],
      paid: ['completed'],
      cancelled: [],
      completed: [],
    };

    if (!validTransitions[currentStatus].includes(nextStatus)) {
      throw new BadRequestException(
        `Transição de status inválida: ${currentStatus} para ${nextStatus}.`,
      );
    }

    if (nextStatus === 'confirmed') {
      await this.assertNoServiceDayConflict(
        appointment.serviceId,
        appointment.scheduledDate,
        appointment.id,
      );
    }

    appointment.status = nextStatus;
    const saved = await this.appointmentsRepo.save(appointment);

    await this.messagingService.publish(
      MuralEvents.APPOINTMENT_STATUS_CHANGED,
      {
        appointmentId: saved.id,
        status: saved.status,
        serviceName: appointment.service?.name ?? '',
        customerEmail: appointment.customer?.email ?? '',
        customerName:
          appointment.customer?.displayName ??
          appointment.customer?.email ??
          '',
        providerName: appointment.service?.provider?.displayName ?? '',
      },
    );

    return saved;
  }

  async payAppointment(
    id: string,
    dto: CreateAppointmentPaymentDto,
    customer: User,
  ): Promise<{
    paymentId: string;
    paymentStatus: 'pending' | 'processing' | 'paid' | 'failed';
    checkoutUrl?: string;
    checkoutSessionId?: string;
    qrCode?: string;
    qrCodeText?: string;
    appointment: Appointment;
  }> {
    const appointment = await this.findOne(id);

    if (appointment.customerId !== customer.id) {
      throw new ForbiddenException(
        'Apenas o cliente dono do agendamento pode pagar.',
      );
    }

    if (!['confirmed', 'awaiting_payment'].includes(appointment.status)) {
      throw new BadRequestException(
        'Agendamento deve estar confirmado ou aguardando pagamento.',
      );
    }

    return this.appointmentsRepo.manager.transaction(async (manager) => {
      const appointmentLocked = await manager
        .getRepository(Appointment)
        .findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });

      if (!appointmentLocked) {
        throw new NotFoundException(`Agendamento ${id} não encontrado.`);
      }

      if (appointmentLocked.customerId !== customer.id) {
        throw new ForbiddenException(
          'Apenas o cliente dono do agendamento pode pagar.',
        );
      }

      const service = await manager.getRepository(Service).findOne({
        where: { id: appointmentLocked.serviceId },
      });

      if (!service) {
        throw new NotFoundException(
          `Serviço ${appointmentLocked.serviceId} não encontrado.`,
        );
      }

      appointmentLocked.service = service;

      const existing = await manager.getRepository(Payment).findOne({
        where: {
          appointmentId: id,
          method: dto.method,
        },
        order: { createdAt: 'DESC' },
      });

      this.logger.log(
        `[payAppointment] appointmentId=${id} method=${dto.method} ` +
          `existing=${existing ? `id=${existing.id} status=${existing.status} checkoutUrl=${existing.checkoutUrl}` : 'null'}`,
      );

      if (existing && existing.status !== 'failed') {
        // Verifica se a checkoutUrl existente é válida (deve ser cs_... para credit_card)
        const isStaleUrl =
          dto.method === 'credit_card' &&
          existing.checkoutUrl &&
          !existing.checkoutUrl.includes('/pay/cs_');

        if (isStaleUrl) {
          this.logger.warn(
            `[payAppointment] checkoutUrl obsoleta detectada para payment ${existing.id}: ` +
              `"${existing.checkoutUrl}" — marcando como failed e criando nova sessão`,
          );
          existing.status = 'failed';
          await manager.getRepository(Payment).save(existing);
        } else {
          this.logger.log(
            `[payAppointment] Reutilizando pagamento existente ${existing.id} com checkoutUrl=${existing.checkoutUrl}`,
          );
          return {
            paymentId: existing.externalPaymentId,
            paymentStatus: existing.status,
            checkoutUrl: existing.checkoutUrl,
            qrCode: existing.qrCode,
            qrCodeText: existing.qrCodeText,
            appointment: appointmentLocked,
          };
        }
      }

      appointmentLocked.status = 'awaiting_payment';
      await manager.getRepository(Appointment).save(appointmentLocked);

      const paymentResult = await this.paymentGateway.createPayment(
        appointmentLocked,
        dto.method,
      );

      this.logger.log(
        `[payAppointment] Nova sessão criada: paymentId=${paymentResult.paymentId} ` +
          `checkoutUrl=${paymentResult.checkoutUrl} checkoutSessionId=${paymentResult.checkoutSessionId}`,
      );

      const paymentEntity = manager.getRepository(Payment).create({
        appointmentId: id,
        method: dto.method,
        status: paymentResult.paymentStatus,
        externalPaymentId: paymentResult.paymentId,
        checkoutUrl: paymentResult.checkoutUrl,
        qrCode: paymentResult.qrCode,
        qrCodeText: paymentResult.qrCodeText,
      });

      await manager.getRepository(Payment).save(paymentEntity);

      if (paymentResult.paymentStatus === 'paid') {
        appointmentLocked.status = 'paid';
      } else if (
        ['pending', 'processing'].includes(paymentResult.paymentStatus)
      ) {
        appointmentLocked.status = 'awaiting_payment';
      } else {
        appointmentLocked.status = 'awaiting_payment';
      }

      const savedAppointment = await manager
        .getRepository(Appointment)
        .save(appointmentLocked);

      await this.messagingService.publish(
        MuralEvents.APPOINTMENT_STATUS_CHANGED,
        {
          appointmentId: savedAppointment.id,
          status: savedAppointment.status,
          serviceName: savedAppointment.service?.name ?? '',
          customerEmail: savedAppointment.customer?.email ?? '',
          customerName:
            savedAppointment.customer?.displayName ??
            savedAppointment.customer?.email ??
            '',
          providerName: savedAppointment.service?.provider?.displayName ?? '',
        },
      );

      return {
        paymentId: paymentResult.paymentId,
        paymentStatus: paymentResult.paymentStatus,
        checkoutUrl: paymentResult.checkoutUrl,
        checkoutSessionId: paymentResult.checkoutSessionId,
        qrCode: paymentResult.qrCode,
        qrCodeText: paymentResult.qrCodeText,
        appointment: savedAppointment,
      };
    });
  }

  async handleStripePaymentSucceeded(externalPaymentId: string): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { externalPaymentId },
      relations: ['appointment'],
    });

    if (!payment) {
      return;
    }

    payment.status = 'paid';
    await this.paymentsRepo.save(payment);

    const appointment = await this.findOne(payment.appointmentId);
    if (appointment.status !== 'paid') {
      appointment.status = 'paid';
      await this.appointmentsRepo.save(appointment);

      await this.messagingService.publish(
        MuralEvents.APPOINTMENT_STATUS_CHANGED,
        {
          appointmentId: appointment.id,
          status: appointment.status,
          serviceName: appointment.service?.name ?? '',
          customerEmail: appointment.customer?.email ?? '',
          customerName:
            appointment.customer?.displayName ??
            appointment.customer?.email ??
            '',
          providerName: appointment.service?.provider?.displayName ?? '',
        },
      );
    }
  }

  async handleStripePaymentFailed(externalPaymentId: string): Promise<void> {
    const payment = await this.paymentsRepo.findOne({
      where: { externalPaymentId },
    });

    if (!payment) {
      return;
    }

    payment.status = 'failed';
    await this.paymentsRepo.save(payment);
  }

  async findMine(
    user: User,
  ): Promise<Appointment[] | { blockedDates: string[] }> {
    if (user.roleInCondominium === 'provider') {
      return this.findByProvider(user.id);
    }

    if (user.roleInCondominium === 'customer') {
      return this.findByCustomer(user.id);
    }

    throw new ForbiddenException('Utilizador sem role válido.');
  }
}
