import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Serviço de notificações WhatsApp via Twilio.
 *
 * Em desenvolvimento: se TWILIO_* não estiver configurado, apenas loga a mensagem.
 * Em produção: envia via Twilio WhatsApp Business API.
 *
 * Configurações necessárias no .env:
 *   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_WHATSAPP_FROM=+14155238886  (sandbox) ou número aprovado
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private client: any = null;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const sid = config.get<string>('TWILIO_ACCOUNT_SID');
    const token = config.get<string>('TWILIO_AUTH_TOKEN');
    this.from = config.get<string>('TWILIO_WHATSAPP_FROM', '+14155238886');

    if (sid && token) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio');
      this.client = twilio(sid, token);
      this.enabled = true;
      this.logger.log('✅ WhatsApp (Twilio) inicializado');
    } else {
      this.enabled = false;
      this.logger.warn(
        '⚠️  TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN não configurados. ' +
          'WhatsApp desabilitado — mensagens apenas no log.',
      );
    }
  }

  /**
   * Envia uma mensagem WhatsApp para o número informado.
   *
   * @param to   Número no formato internacional: +5511999999999
   * @param body Texto da mensagem (até 1600 chars)
   */
  async send(to: string, body: string): Promise<void> {
    const phone = this.normalizePhone(to);
    if (!phone) {
      this.logger.warn(`WhatsApp: número inválido ou ausente — "${to}"`);
      return;
    }

    if (!this.enabled || !this.client) {
      // Modo dev: apenas exibe no log
      this.logger.debug(`[WhatsApp SIMULADO] Para: ${phone}\n${body}`);
      return;
    }

    try {
      await this.client.messages.create({
        from: `whatsapp:${this.from}`,
        to: `whatsapp:${phone}`,
        body,
      });
      this.logger.log(`📱 WhatsApp enviado para ${phone}`);
    } catch (err) {
      this.logger.error(
        `Falha ao enviar WhatsApp para ${phone}: ${(err as Error).message}`,
      );
    }
  }

  // ── Mensagens pré-formatadas ───────────────────────────────────────────────

  /** Notifica o prestador sobre novo agendamento solicitado */
  async notifyProviderNewAppointment(params: {
    providerPhone: string;
    providerName: string;
    customerName: string;
    serviceName: string;
    scheduledDay: string;
    scheduledDate: string;
    scheduledTime?: string;
  }): Promise<void> {
    const dateFormatted = this.formatDate(params.scheduledDate);
    const timeStr = params.scheduledTime ? ` às ${params.scheduledTime}` : '';

    await this.send(
      params.providerPhone,
      [
        `🔔 *Novo agendamento solicitado!*`,
        ``,
        `Olá, *${params.providerName}*!`,
        ``,
        `*${params.customerName}* solicitou um agendamento para:`,
        `📋 Serviço: *${params.serviceName}*`,
        `📅 Data: *${params.scheduledDay}, ${dateFormatted}${timeStr}*`,
        ``,
        `Acesse o app para confirmar ou recusar o agendamento.`,
        ``,
        `_— Mural do Condomínio_`,
      ].join('\n'),
    );
  }

  /** Notifica o cliente sobre mudança de status do agendamento */
  async notifyCustomerStatusChanged(params: {
    customerPhone: string;
    customerName: string;
    serviceName: string;
    providerName: string;
    status: string;
    scheduledDay?: string;
    scheduledDate?: string;
    scheduledTime?: string;
  }): Promise<void> {
    const statusInfo = this.getStatusMessage(params.status);
    if (!statusInfo) return; // Status sem notificação definida

    const dateFormatted = params.scheduledDate
      ? this.formatDate(params.scheduledDate)
      : '';
    const timeStr = params.scheduledTime ? ` às ${params.scheduledTime}` : '';
    const dateLine =
      params.scheduledDay && dateFormatted
        ? `📅 Data: *${params.scheduledDay}, ${dateFormatted}${timeStr}*\n`
        : '';

    await this.send(
      params.customerPhone,
      [
        `${statusInfo.emoji} *${statusInfo.title}*`,
        ``,
        `Olá, *${params.customerName}*!`,
        ``,
        `Seu agendamento para o serviço *"${params.serviceName}"* com *${params.providerName}* foi ${statusInfo.label}.`,
        dateLine ? dateLine.trimEnd() : '',
        ``,
        statusInfo.hint,
        ``,
        `_— Mural do Condomínio_`,
      ]
        .filter((line) => line !== '')
        .join('\n'),
    );
  }

  /** Notifica o cliente que o pagamento foi confirmado */
  async notifyCustomerPaymentConfirmed(params: {
    customerPhone: string;
    customerName: string;
    serviceName: string;
    providerName: string;
    scheduledDay?: string;
    scheduledDate?: string;
    scheduledTime?: string;
  }): Promise<void> {
    const dateFormatted = params.scheduledDate
      ? this.formatDate(params.scheduledDate)
      : '';
    const timeStr = params.scheduledTime ? ` às ${params.scheduledTime}` : '';
    const dateStr =
      params.scheduledDay && dateFormatted
        ? `${params.scheduledDay}, ${dateFormatted}${timeStr}`
        : '';

    await this.send(
      params.customerPhone,
      [
        `💳 *Pagamento confirmado!*`,
        ``,
        `Olá, *${params.customerName}*!`,
        ``,
        `Seu pagamento pelo serviço *"${params.serviceName}"* com *${params.providerName}* foi confirmado com sucesso.`,
        dateStr ? `📅 Data: *${dateStr}*` : '',
        ``,
        `Fique atento ao dia combinado. Qualquer dúvida, use o chat no app.`,
        ``,
        `_— Mural do Condomínio_`,
      ]
        .filter((l) => l !== '')
        .join('\n'),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getStatusMessage(status: string): {
    emoji: string;
    title: string;
    label: string;
    hint: string;
  } | null {
    const map: Record<
      string,
      { emoji: string; title: string; label: string; hint: string }
    > = {
      confirmed: {
        emoji: '✅',
        title: 'Agendamento confirmado!',
        label: 'confirmado',
        hint: 'O prestador confirmou o horário. Fique atento ao dia combinado!',
      },
      cancelled: {
        emoji: '❌',
        title: 'Agendamento cancelado',
        label: 'cancelado',
        hint: 'Caso precise reagendar, acesse o Mural do Condomínio.',
      },
      completed: {
        emoji: '🎉',
        title: 'Serviço concluído!',
        label: 'concluído',
        hint: 'Esperamos que o serviço tenha sido ótimo! Não esqueça de deixar sua avaliação no app.',
      },
      awaiting_payment: {
        emoji: '💰',
        title: 'Pagamento pendente',
        label: 'aguardando pagamento',
        hint: 'Acesse o app para realizar o pagamento e confirmar seu agendamento.',
      },
    };
    return map[status] ?? null;
  }

  /** Normaliza o telefone para o formato E.164 (+55XXXXXXXXXXX) */
  private normalizePhone(phone: string): string | null {
    if (!phone) return null;
    // Remove tudo que não é dígito ou +
    const clean = phone.replace(/[^\d+]/g, '');
    if (!clean) return null;
    // Se já tem + assume que está correto
    if (clean.startsWith('+')) return clean;
    // Assume Brasil (+55) se não tiver código de país
    return `+55${clean}`;
  }

  private formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo',
      });
    } catch {
      return dateStr;
    }
  }
}
