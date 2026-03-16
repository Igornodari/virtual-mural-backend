import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { StripeService } from './stripe.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    private readonly stripeService: StripeService,
  ) {}

  // ── Onboarding do prestador ─────────────────────────────────────────────────

  async startProviderOnboarding(
    user: User,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<{ onboardingUrl: string; accountId: string }> {
    if (user.roleInCondominium !== 'provider') {
      throw new ForbiddenException('Apenas prestadores podem conectar uma conta bancária.');
    }

    let accountId = user.stripeAccountId;

    // Cria a conta Connect se ainda não existir
    if (!accountId) {
      accountId = await this.stripeService.createConnectAccount(user.email);
      await this.usersRepo.update(user.id, {
        stripeAccountId: accountId,
        stripeAccountStatus: 'pending',
      });
    }

    const onboardingUrl = await this.stripeService.createOnboardingLink(
      accountId,
      refreshUrl,
      returnUrl,
    );

    return { onboardingUrl, accountId };
  }

  async getProviderConnectStatus(user: User): Promise<{
    hasAccount: boolean;
    accountId: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    status: string;
  }> {
    if (!user.stripeAccountId) {
      return {
        hasAccount: false,
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        status: 'not_connected',
      };
    }

    const accountStatus = await this.stripeService.getAccountStatus(user.stripeAccountId);
    const status = accountStatus.chargesEnabled ? 'active' : 'pending';

    // Atualiza o status no banco
    if (user.stripeAccountStatus !== status) {
      await this.usersRepo.update(user.id, { stripeAccountStatus: status });
    }

    return {
      hasAccount: true,
      accountId: user.stripeAccountId,
      ...accountStatus,
      status,
    };
  }

  async getProviderDashboardLink(user: User): Promise<{ dashboardUrl: string }> {
    if (!user.stripeAccountId) {
      throw new BadRequestException('Conta Stripe não conectada.');
    }
    const dashboardUrl = await this.stripeService.createDashboardLink(user.stripeAccountId);
    return { dashboardUrl };
  }

  // ── Criação de PaymentIntent para agendamento ────────────────────────────────

  async createPaymentIntentForAppointment(
    appointmentId: string,
    requesterId: string,
  ): Promise<{ clientSecret: string; amountInCents: number }> {
    const appointment = await this.appointmentsRepo.findOne({
      where: { id: appointmentId },
      relations: ['service', 'service.provider'],
    });

    if (!appointment) {
      throw new NotFoundException(`Agendamento ${appointmentId} não encontrado.`);
    }

    if (appointment.customerId !== requesterId) {
      throw new ForbiddenException('Apenas o cliente pode iniciar o pagamento.');
    }

    if (appointment.status !== 'pending_payment') {
      throw new BadRequestException(
        `Agendamento já está com status "${appointment.status}". Pagamento não permitido.`,
      );
    }

    const provider = appointment.service?.provider;
    if (!provider?.stripeAccountId) {
      throw new BadRequestException(
        'O prestador ainda não configurou sua conta de recebimento. ' +
        'Por favor, tente novamente mais tarde.',
      );
    }

    const amountInCents = appointment.service.priceInCents;
    if (!amountInCents || amountInCents <= 0) {
      throw new BadRequestException('Este serviço não possui preço definido para pagamento in-app.');
    }

    const { paymentIntentId, clientSecret } =
      await this.stripeService.createPaymentIntent({
        amountInCents,
        providerStripeAccountId: provider.stripeAccountId,
        appointmentId,
        serviceId: appointment.serviceId,
        customerId: requesterId,
      });

    // Salva o PaymentIntent no agendamento
    await this.appointmentsRepo.update(appointmentId, {
      stripePaymentIntentId: paymentIntentId,
      stripeClientSecret: clientSecret,
      amountInCents,
    });

    return { clientSecret, amountInCents };
  }

  // ── Confirmação de conclusão pelo morador ────────────────────────────────────

  async confirmServiceCompleted(
    appointmentId: string,
    requesterId: string,
  ): Promise<Appointment> {
    const appointment = await this.appointmentsRepo.findOne({
      where: { id: appointmentId },
      relations: ['service'],
    });

    if (!appointment) {
      throw new NotFoundException(`Agendamento ${appointmentId} não encontrado.`);
    }

    if (appointment.customerId !== requesterId) {
      throw new ForbiddenException('Apenas o cliente pode confirmar a conclusão do serviço.');
    }

    if (!['confirmed', 'in_progress'].includes(appointment.status)) {
      throw new BadRequestException(
        `Não é possível confirmar conclusão para um agendamento com status "${appointment.status}".`,
      );
    }

    // Captura o pagamento (libera o dinheiro ao prestador)
    if (appointment.stripePaymentIntentId) {
      await this.stripeService.capturePayment(appointment.stripePaymentIntentId);
    }

    appointment.status = 'completed';
    appointment.completedAt = new Date();
    return this.appointmentsRepo.save(appointment);
  }

  // ── Cancelamento com reembolso ───────────────────────────────────────────────

  async cancelAppointment(
    appointmentId: string,
    requesterId: string,
  ): Promise<Appointment> {
    const appointment = await this.appointmentsRepo.findOne({
      where: { id: appointmentId },
      relations: ['service'],
    });

    if (!appointment) {
      throw new NotFoundException(`Agendamento ${appointmentId} não encontrado.`);
    }

    if (appointment.customerId !== requesterId) {
      throw new ForbiddenException('Apenas o cliente pode cancelar este agendamento.');
    }

    if (appointment.status === 'completed') {
      throw new BadRequestException(
        'Não é possível cancelar um serviço já concluído.',
      );
    }

    if (['cancelled', 'refunded'].includes(appointment.status)) {
      throw new BadRequestException('Este agendamento já foi cancelado.');
    }

    let refundId: string | null = null;

    // Reembolsa o pagamento se existir
    if (appointment.stripePaymentIntentId) {
      refundId = await this.stripeService.refundPayment(
        appointment.stripePaymentIntentId,
      );
    }

    appointment.status = 'refunded';
    appointment.cancelledAt = new Date();
    if (refundId && refundId !== 'cancelled') {
      appointment.stripeRefundId = refundId;
    }

    return this.appointmentsRepo.save(appointment);
  }

  // ── Webhook do Stripe ────────────────────────────────────────────────────────

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    let event;
    try {
      event = this.stripeService.constructWebhookEvent(payload, signature);
    } catch (err) {
      this.logger.error(`Webhook inválido: ${err.message}`);
      throw new BadRequestException(`Webhook inválido: ${err.message}`);
    }

    this.logger.log(`Webhook recebido: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as any;
        const appointmentId = pi.metadata?.appointmentId;
        if (appointmentId) {
          await this.appointmentsRepo.update(
            { stripePaymentIntentId: pi.id },
            { status: 'confirmed', paidAt: new Date() },
          );
          this.logger.log(`Agendamento ${appointmentId} confirmado via webhook.`);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as any;
        const appointmentId = pi.metadata?.appointmentId;
        if (appointmentId) {
          await this.appointmentsRepo.update(
            { stripePaymentIntentId: pi.id },
            { status: 'cancelled', cancelledAt: new Date() },
          );
          this.logger.warn(`Pagamento falhou para agendamento ${appointmentId}.`);
        }
        break;
      }

      case 'account.updated': {
        const account = event.data.object as any;
        if (account.charges_enabled) {
          await this.usersRepo.update(
            { stripeAccountId: account.id },
            { stripeAccountStatus: 'active' },
          );
          this.logger.log(`Conta Stripe ${account.id} ativada.`);
        }
        break;
      }

      default:
        this.logger.debug(`Evento não tratado: ${event.type}`);
    }
  }
}
