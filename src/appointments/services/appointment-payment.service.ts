import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';

import { Appointment } from '../entities/appointment.entity';
import { Payment } from '../entities/payment.entity';
import { Service } from '../../services/entities/service.entity';
import { User } from '../../users/entities/user.entity';

import { CreateAppointmentPaymentDto } from '../dto/create-appointment-payment.dto';

import type { IPaymentGateway } from '../payment/payment-gateway.interface';

import { AppointmentQueryService } from './appointment-query.service';
import { AppointmentNotificationService } from './appointment-notification.service';

@Injectable()
export class AppointmentPaymentService {
  private readonly logger = new Logger(AppointmentPaymentService.name);
  private readonly stripe: Stripe | null = null;

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,

    @InjectRepository(Payment)
    private readonly paymentsRepo: Repository<Payment>,

    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,

    private readonly configService: ConfigService,
    private readonly appointmentQueryService: AppointmentQueryService,
    private readonly notificationService: AppointmentNotificationService,

    @Inject('PAYMENT_GATEWAY')
    private readonly paymentGateway: IPaymentGateway,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (secretKey) {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2026-02-25.clover',
      });
    }
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
    const appointment = await this.appointmentQueryService.findOne(id);

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
        relations: ['provider'],
      });

      if (!service) {
        throw new NotFoundException(
          `Serviço ${appointmentLocked.serviceId} não encontrado.`,
        );
      }

      appointmentLocked.service = service;

      const providerStripeAccountId =
        service.provider?.stripeAccountStatus === 'active'
          ? (service.provider.stripeAccountId ?? null)
          : null;

      const existing = await manager.getRepository(Payment).findOne({
        where: {
          appointmentId: id,
          method: dto.method,
        },
        order: { createdAt: 'DESC' },
      });

      this.logger.log(
        `[payAppointment] appointmentId=${id} method=${dto.method} ` +
          `existing=${
            existing
              ? `id=${existing.id} status=${existing.status} checkoutUrl=${existing.checkoutUrl}`
              : 'null'
          }`,
      );

      if (existing && existing.status !== 'failed') {
        const isStaleUrl =
          dto.method === 'credit_card' &&
          existing.checkoutUrl &&
          !existing.checkoutUrl.includes('/pay/cs_');

        if (isStaleUrl) {
          this.logger.warn(
            `[payAppointment] checkoutUrl obsoleta detectada para payment ${existing.id}: "${existing.checkoutUrl}" — marcando como failed e criando nova sessão`,
          );

          existing.status = 'failed';

          await manager.getRepository(Payment).save(existing);
        } else {
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
        providerStripeAccountId,
      );

      const paymentEntity = manager.getRepository(Payment).create({
        appointmentId: id,
        method: dto.method,
        status: paymentResult.paymentStatus,
        externalPaymentId: paymentResult.paymentId,
        checkoutSessionId: paymentResult.checkoutSessionId ?? null,
        checkoutUrl: paymentResult.checkoutUrl,
        qrCode: paymentResult.qrCode,
        qrCodeText: paymentResult.qrCodeText,
      });

      await manager.getRepository(Payment).save(paymentEntity);

      appointmentLocked.status =
        paymentResult.paymentStatus === 'paid' ? 'paid' : 'awaiting_payment';

      const savedAppointment = await manager
        .getRepository(Appointment)
        .save(appointmentLocked);

      await this.notificationService.publishAppointmentStatusChanged(
        savedAppointment,
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

  async handleStripeCheckoutSessionCompleted(params: {
    appointmentId: string;
    sessionId: string;
  }): Promise<void> {
    await this.appointmentsRepo.manager.transaction(async (manager) => {
      const appointment = await manager.getRepository(Appointment).findOne({
        where: { id: params.appointmentId },
        relations: ['customer', 'service', 'service.provider'],
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

      await this.notificationService.publishAppointmentStatusChanged(
        appointment,
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

    const appointment = await this.appointmentQueryService.findOne(
      payment.appointmentId,
    );

    if (appointment.status !== 'paid') {
      appointment.status = 'paid';

      await this.appointmentsRepo.save(appointment);

      await this.notificationService.publishAppointmentStatusChanged(
        appointment,
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

  async verifyPaymentSession(
    checkoutSessionId: string,
    requesterId: string,
  ): Promise<Appointment> {
    const payment = await this.paymentsRepo.findOne({
      where: { checkoutSessionId },
    });

    if (!payment) {
      throw new NotFoundException(
        `Nenhum pagamento encontrado para a sessão ${checkoutSessionId}.`,
      );
    }

    const appointment = await this.appointmentQueryService.findOne(
      payment.appointmentId,
    );

    if (appointment.customerId !== requesterId) {
      throw new ForbiddenException('Acesso negado a este agendamento.');
    }

    if (appointment.status === 'paid' || appointment.status === 'completed') {
      return appointment;
    }

    if (!this.stripe) {
      throw new BadRequestException(
        'Gateway de pagamento Stripe não configurado.',
      );
    }

    const session =
      await this.stripe.checkout.sessions.retrieve(checkoutSessionId);

    if (session.payment_status === 'paid') {
      await this.handleStripeCheckoutSessionCompleted({
        appointmentId: payment.appointmentId,
        sessionId: checkoutSessionId,
      });

      return this.appointmentQueryService.findOne(payment.appointmentId);
    }

    return appointment;
  }

  async syncPendingPaymentsForCustomer(customerId: string): Promise<void> {
    if (!this.stripe) {
      return;
    }

    const payments = await this.paymentsRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.appointment', 'appointment')
      .where('appointment.customerId = :customerId', { customerId })
      .andWhere('appointment.status = :appointmentStatus', {
        appointmentStatus: 'awaiting_payment',
      })
      .andWhere('payment.status IN (:...paymentStatuses)', {
        paymentStatuses: ['pending', 'processing'],
      })
      .andWhere('payment.checkoutSessionId IS NOT NULL')
      .orderBy('payment.createdAt', 'DESC')
      .getMany();

    for (const payment of payments) {
      if (!payment.checkoutSessionId) {
        continue;
      }

      try {
        const session = await this.stripe.checkout.sessions.retrieve(
          payment.checkoutSessionId,
        );

        if (session.payment_status === 'paid') {
          await this.handleStripeCheckoutSessionCompleted({
            appointmentId: payment.appointmentId,
            sessionId: payment.checkoutSessionId,
          });
        }
      } catch {
        this.logger.warn(
          `[syncPendingPaymentsForCustomer] Sessão ${payment.checkoutSessionId} não encontrada no Stripe — marcando como failed`,
        );
        payment.status = 'failed';
        await this.paymentsRepo.save(payment);
      }
    }
  }

  async syncPendingPaymentsForProvider(providerId: string): Promise<void> {
    if (!this.stripe) {
      return;
    }

    const payments = await this.paymentsRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.appointment', 'appointment')
      .leftJoinAndSelect('appointment.service', 'service')
      .where('service.providerId = :providerId', { providerId })
      .andWhere('appointment.status = :appointmentStatus', {
        appointmentStatus: 'awaiting_payment',
      })
      .andWhere('payment.status IN (:...paymentStatuses)', {
        paymentStatuses: ['pending', 'processing'],
      })
      .andWhere('payment.checkoutSessionId IS NOT NULL')
      .orderBy('payment.createdAt', 'DESC')
      .getMany();

    for (const payment of payments) {
      if (!payment.checkoutSessionId) {
        continue;
      }

      try {
        const session = await this.stripe.checkout.sessions.retrieve(
          payment.checkoutSessionId,
        );

        if (session.payment_status === 'paid') {
          await this.handleStripeCheckoutSessionCompleted({
            appointmentId: payment.appointmentId,
            sessionId: payment.checkoutSessionId,
          });
        }
      } catch {
        this.logger.warn(
          `[syncPendingPaymentsForProvider] Sessão ${payment.checkoutSessionId} não encontrada no Stripe — marcando como failed`,
        );
        payment.status = 'failed';
        await this.paymentsRepo.save(payment);
      }
    }
  }
}
