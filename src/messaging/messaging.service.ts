import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';

type ConsumerHandler = (
  event: string,
  payload: Record<string, unknown>,
) => Promise<void>;

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly queue: string;
  private readonly url: string;

  /**
   * Handlers registrados via `consume()` ANTES do canal abrir
   * (race condition no boot: `MuralEventsConsumer.onModuleInit` pode
   * rodar enquanto o `await amqp.connect()` ainda está pendente).
   *
   * Mantemos todos os handlers numa lista — quando o canal abrir
   * (ou reabrir após reconexão), aplicamos cada um. Assim a fila
   * volta a ser consumida automaticamente após uma queda do broker.
   */
  private readonly pendingHandlers: ConsumerHandler[] = [];

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

      // Re-registra todos os consumers pendentes — cobre:
      //   (a) consumers que tentaram registrar antes do canal abrir
      //   (b) reconexão após queda do broker
      await this.flushPendingHandlers();

      // Registra listeners para erros de conexão
      this.connection.on('error', (err) => {
        this.logger.error('Erro na conexão RabbitMQ:', (err as Error).message);
      });
      this.connection.on('close', () => {
        this.channel = null;
        this.connection = null;
        this.logger.warn(
          'Conexão RabbitMQ encerrada. Tentando reconectar em 5s...',
        );
        // `void` evita warning de no-misused-promises: setTimeout aceita
        // só () => void e connect() retorna Promise<void>.
        setTimeout(() => {
          void this.connect();
        }, 5000);
      });
    } catch (err) {
      this.logger.error(
        `Falha ao conectar ao RabbitMQ (${this.url}): ${(err as Error).message}`,
      );
      this.logger.warn('Tentando reconectar em 5s...');
      setTimeout(() => {
        void this.connect();
      }, 5000);
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
   * Retorna `Promise<void>` para compatibilidade com callers que usam
   * `await`, mas internamente é síncrono — amqplib bufferiza o send.
   *
   * @param event - Nome do evento (ex: 'service.created')
   * @param payload - Objeto com os dados do evento
   */
  publish(event: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.channel) {
      this.logger.warn(
        `Canal RabbitMQ indisponível. Evento "${event}" descartado.`,
      );
      return Promise.resolve();
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
    return Promise.resolve();
  }

  /**
   * Registra um consumidor para processar mensagens da fila.
   *
   * Tolerante a race condition: se o canal ainda não estiver aberto
   * (consumer.onModuleInit pode rodar antes do amqp.connect resolver),
   * guardamos o handler e aplicamos quando o canal abrir. O mesmo
   * mecanismo cobre reconexão após queda do broker.
   *
   * @param handler - Função que recebe o evento e o payload
   */
  async consume(handler: ConsumerHandler): Promise<void> {
    this.pendingHandlers.push(handler);

    if (!this.channel) {
      this.logger.log(
        'Canal RabbitMQ ainda não aberto — consumer enfileirado e será registrado quando a conexão estiver pronta.',
      );
      return;
    }

    await this.registerHandlerOnChannel(handler);
  }

  /**
   * Aplica todos os handlers pendentes ao canal recém-aberto.
   */
  private async flushPendingHandlers(): Promise<void> {
    if (!this.channel || this.pendingHandlers.length === 0) return;

    for (const handler of this.pendingHandlers) {
      try {
        await this.registerHandlerOnChannel(handler);
      } catch (err) {
        this.logger.error(
          `Falha ao registrar consumer pendente: ${(err as Error).message}`,
        );
      }
    }
  }

  private async registerHandlerOnChannel(
    handler: ConsumerHandler,
  ): Promise<void> {
    if (!this.channel) return;

    // Processa uma mensagem por vez (prefetch = 1) para garantir ordem
    await this.channel.prefetch(1);

    // O callback do amqp.consume declara tipo `(msg) => void` — usar
    // `async` direto gera no-misused-promises. Envolvemos em IIFE com
    // `void` para sinalizar fire-and-forget intencional.
    await this.channel.consume(this.queue, (msg) => {
      void this.processMessage(msg, handler);
    });

    this.logger.log(`👂 Consumidor registrado na fila "${this.queue}"`);
  }

  /**
   * Processa uma mensagem do RabbitMQ chamando o handler do usuário.
   * Em caso de erro, descarta a mensagem (nack sem requeue) para
   * evitar loop infinito de retry numa mensagem mal-formada.
   */
  private async processMessage(
    msg: ConsumeMessage | null,
    handler: ConsumerHandler,
  ): Promise<void> {
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
  }
}
