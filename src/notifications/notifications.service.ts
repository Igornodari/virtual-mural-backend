import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface EmailPayload {
  to: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}

export interface SnsPayload {
  topicArn: string;
  subject: string;
  message: string;
  attributes?: Record<string, string>;
}

/**
 * Serviço de notificações via AWS SNS e SES.
 *
 * SNS → Notificações para grupos (ex: todos os moradores de um condomínio).
 *       Cada condomínio pode ter um tópico SNS próprio, permitindo
 *       que moradores se inscrevam para receber push/SMS/e-mail.
 *
 * SES → E-mails transacionais diretos (ex: confirmação de agendamento).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly sns: SNSClient;
  private readonly ses: SESClient;
  private readonly fromEmail: string;
  private readonly condominiumTopicArn: string;

  constructor(private readonly config: ConfigService) {
    const region = config.get<string>('AWS_REGION', 'sa-east-1');

    this.sns = new SNSClient({ region });
    this.ses = new SESClient({ region });

    this.fromEmail = config.get<string>(
      'SES_FROM_EMAIL',
      'noreply@virtual-mural.com',
    );
    this.condominiumTopicArn = config.get<string>(
      'SNS_CONDOMINIUM_TOPIC_ARN',
      '',
    );
  }

  // ── SNS ──────────────────────────────────────────────────────────────────

  /**
   * Publica uma mensagem em um tópico SNS.
   * Todos os assinantes do tópico (e-mail, SMS, Lambda, SQS) receberão a mensagem.
   */
  async publishToTopic(payload: SnsPayload): Promise<void> {
    if (!payload.topicArn) {
      this.logger.warn('SNS TopicArn não configurado. Notificação ignorada.');
      return;
    }

    const messageAttributes: Record<
      string,
      { DataType: string; StringValue: string }
    > = {};
    if (payload.attributes) {
      for (const [key, value] of Object.entries(payload.attributes)) {
        messageAttributes[key] = { DataType: 'String', StringValue: value };
      }
    }

    const command = new PublishCommand({
      TopicArn: payload.topicArn,
      Subject: payload.subject,
      Message: payload.message,
      MessageAttributes: messageAttributes,
    });

    await this.sns.send(command);
    this.logger.debug(`📣 SNS publicado no tópico: ${payload.topicArn}`);
  }

  /**
   * Notifica todos os moradores de um condomínio via SNS.
   * Usa o tópico padrão configurado em SNS_CONDOMINIUM_TOPIC_ARN.
   * Em produção, cada condomínio deve ter seu próprio tópico.
   */
  async notifyCondominiumResidents(
    condominiumId: string,
    subject: string,
    message: string,
  ): Promise<void> {
    const topicArn = this.condominiumTopicArn || '';
    if (!topicArn) {
      this.logger.warn(
        `SNS_CONDOMINIUM_TOPIC_ARN não configurado. Notificação para condomínio ${condominiumId} ignorada.`,
      );
      return;
    }

    await this.publishToTopic({
      topicArn,
      subject,
      message,
      attributes: { condominiumId },
    });
  }

  // ── SES ──────────────────────────────────────────────────────────────────

  /**
   * Envia um e-mail transacional via AWS SES.
   */
  async sendEmail(payload: EmailPayload): Promise<void> {
    if (!payload.to.length) return;

    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: { ToAddresses: payload.to },
      Message: {
        Subject: { Data: payload.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: payload.bodyText, Charset: 'UTF-8' },
          ...(payload.bodyHtml && {
            Html: { Data: payload.bodyHtml, Charset: 'UTF-8' },
          }),
        },
      },
    });

    await this.ses.send(command);
    this.logger.debug(`📧 E-mail enviado para: ${payload.to.join(', ')}`);
  }

  /**
   * Envia e-mail de confirmação de agendamento para o prestador.
   */
  async sendAppointmentRequestEmail(
    providerEmail: string,
    providerName: string,
    customerName: string,
    serviceName: string,
    scheduledDay: string,
    scheduledDate: string,
  ): Promise<void> {
    const subject = `Novo agendamento solicitado — ${serviceName}`;
    const bodyText = [
      `Olá, ${providerName}!`,
      '',
      `${customerName} solicitou um agendamento para o seu serviço "${serviceName}".`,
      '',
      `📅 Data: ${new Date(scheduledDate).toLocaleDateString('pt-BR')}`,
      `📆 Dia da semana: ${scheduledDay}`,
      '',
      'Acesse o Mural do Condomínio para confirmar ou recusar o agendamento.',
      '',
      '— Equipe Virtual Mural',
    ].join('\n');

    const bodyHtml = `
      <h2>Novo agendamento solicitado</h2>
      <p>Olá, <strong>${providerName}</strong>!</p>
      <p><strong>${customerName}</strong> solicitou um agendamento para o seu serviço <strong>"${serviceName}"</strong>.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0"><strong>📅 Data:</strong></td><td>${new Date(scheduledDate).toLocaleDateString('pt-BR')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>📆 Dia:</strong></td><td>${scheduledDay}</td></tr>
      </table>
      <p>Acesse o <a href="https://virtual-mural.com">Mural do Condomínio</a> para confirmar ou recusar o agendamento.</p>
      <hr/>
      <small>Equipe Virtual Mural</small>
    `;

    await this.sendEmail({
      to: [providerEmail],
      subject,
      bodyText,
      bodyHtml,
    });
  }

  /**
   * Envia e-mail de nova avaliação para o prestador.
   */
  async sendReviewNotificationEmail(
    providerEmail: string,
    providerName: string,
    authorName: string,
    serviceName: string,
    rating: number,
  ): Promise<void> {
    const stars = '⭐'.repeat(rating);
    const subject = `Nova avaliação recebida — ${serviceName}`;
    const bodyText = [
      `Olá, ${providerName}!`,
      '',
      `${authorName} avaliou seu serviço "${serviceName}" com ${rating} estrelas ${stars}.`,
      '',
      'Acesse o Mural do Condomínio para ver o comentário completo.',
      '',
      '— Equipe Virtual Mural',
    ].join('\n');

    await this.sendEmail({
      to: [providerEmail],
      subject,
      bodyText,
    });
  }
}
