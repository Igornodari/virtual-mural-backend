import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly queue: string;
  private readonly url: string;

  constructor(private readonly config: ConfigService) {
    this.url = config.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );
    this.queue = config.get<string>('RABBITMQ_QUEUE', 'virtual_mural_queue');
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      // Garante que a fila existe e é durável (sobrevive a reinicializações do broker)
      await this.channel.assertQueue(this.queue, { durable: true });

      this.logger.log(`✅ Conectado ao RabbitMQ — fila: "${this.queue}"`);

      // Registra listeners para erros de conexão
      this.connection.on('error', (err) => {
        this.logger.error('Erro na conexão RabbitMQ:', (err as Error).message);
      });
      this.connection.on('close', () => {
        this.logger.warn(
          'Conexão RabbitMQ encerrada. Tentando reconectar em 5s...',
        );
        setTimeout(() => this.connect(), 5000);
      });
    } catch (err) {
      this.logger.error(
        `Falha ao conectar ao RabbitMQ (${this.url}): ${(err as Error).message}`,
      );
      this.logger.warn('Tentando reconectar em 5s...');
      setTimeout(() => this.connect(), 5000);
    }
  }

  private async disconnect(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // Ignora erros ao encerrar
    }
  }

  /**
   * Publica uma mensagem na fila com o padrão de roteamento do evento.
   *
   * @param event - Nome do evento (ex: 'service.created')
   * @param payload - Objeto com os dados do evento
   */
  async publish(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn(
        `Canal RabbitMQ indisponível. Evento "${event}" descartado.`,
      );
      return;
    }

    const message = Buffer.from(
      JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
    );

    this.channel.sendToQueue(this.queue, message, {
      persistent: true, // Mensagem sobrevive a reinicializações do broker
      contentType: 'application/json',
      headers: { 'x-event-type': event },
    });

    this.logger.debug(`📤 Evento publicado: ${event}`);
  }

  /**
   * Registra um consumidor para processar mensagens da fila.
   * Útil para workers que precisam reagir a eventos (ex: enviar notificações).
   *
   * @param handler - Função que recebe o evento e o payload
   */
  async consume(
    handler: (event: string, payload: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn(
        'Canal RabbitMQ indisponível. Consumidor não registrado.',
      );
      return;
    }

    // Processa uma mensagem por vez (prefetch = 1) para garantir ordem
    await this.channel.prefetch(1);

    await this.channel.consume(this.queue, async (msg) => {
      if (!msg) return;

      try {
        const { event, payload } = JSON.parse(msg.content.toString()) as {
          event: string;
          payload: Record<string, unknown>;
        };

        this.logger.debug(`📥 Evento recebido: ${event}`);
        await handler(event, payload);
        this.channel?.ack(msg);
      } catch (err) {
        this.logger.error(
          'Erro ao processar mensagem:',
          (err as Error).message,
        );
        // Rejeita e descarta a mensagem (não re-enfileira para evitar loop)
        this.channel?.nack(msg, false, false);
      }
    });

    this.logger.log(`👂 Consumidor registrado na fila "${this.queue}"`);
  }
}
