import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MessagingService } from '../messaging.service';
import { SentryReporter } from '../../sentry/sentry.reporter';

/**
 * Consumidor da Dead Letter Queue (DLQ).
 *
 * Toda mensagem que esgotou as tentativas de retry na fila principal
 * chega aqui. O consumer:
 *   1. Loga o conteúdo completo da mensagem morta
 *   2. Captura um erro estruturado para o Sentry (alerta em produção)
 *   3. Faz ack para remover a mensagem da DLQ
 *
 * Nunca lança exceção — uma falha aqui não pode bloquear o canal.
 */
@Injectable()
export class DeadLetterQueueConsumer implements OnModuleInit {
  private readonly logger = new Logger(DeadLetterQueueConsumer.name);

  constructor(private readonly messagingService: MessagingService) {}

  async onModuleInit(): Promise<void> {
    await this.messagingService.consumeDlq(async (rawMessage: string) => {
      await this.handleDeadLetter(rawMessage);
    });
  }

  private async handleDeadLetter(rawMessage: string): Promise<void> {
    let event = 'unknown';
    let payload: unknown = null;

    try {
      const parsed = JSON.parse(rawMessage) as {
        event?: string;
        payload?: unknown;
        timestamp?: string;
        retryCount?: number;
      };
      event = parsed.event ?? 'unknown';
      payload = parsed.payload ?? null;
    } catch {
      this.logger.error(`💀 DLQ: mensagem com JSON inválido — ${rawMessage}`);
    }

    this.logger.error(
      `💀 Mensagem morta — evento: "${event}", payload: ${JSON.stringify(payload)}`,
    );

    // Captura ao Sentry para gerar alerta em produção
    const dlqError = new Error(
      `[DLQ] Mensagem descartada após retries esgotados: evento "${event}"`,
    );
    dlqError.name = 'DeadLetterError';
    SentryReporter.capture(dlqError);
  }
}
