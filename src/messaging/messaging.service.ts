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

/** Handler chamado pelo DeadLetterQueueConsumer — recebe o JSON bruto da mensagem. */
type DlqHandler = (rawMessage: string) => Promise<void>;

/** Número máximo de tentativas antes de enviar para a DLQ. */
const MAX_RETRIES = 3;

/** Header que rastreia quantas vezes a mensagem foi re-tentada. */
const RETRY_COUNT_HEADER = 'x-retry-count';

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  private readonly queue: string;
  private readonly dlxExchange: string;
  private readonly dlqQueue: string;
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
  private readonly pendingDlqHandlers: DlqHandler[] = [];

  constructor(private readonly config: ConfigService) {
    this.url = config.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );
    this.queue = config.get<string>('RABBITMQ_QUEUE', 'virtual_mural_queue');
    this.dlxExchange = config.get<string>(
      'RABBITMQ_DLX_EXCHANGE',
      'virtual_mural_dlx',
    );
    this.dlqQueue = config.get<string>(
      'RABBITMQ_DLQ_QUEUE',
      'virtual_mural_dlq',
    );
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

      await this.setupDlq();
      await this.setupMainQueue();

      this.logger.log(`✅ Conectado ao RabbitMQ — fila: "${this.queue}", DLQ: "${this.dlqQueue}"`);

      await this.flushPendingHandlers();

      this.connection.on('error', (err) => {
        this.logger.error('Erro na conexão RabbitMQ:', (err as Error).message);
      });
      this.connection.on('close', () => {
        this.channel = null;
        this.connection = null;
        this.logger.warn(
          'Conexão RabbitMQ encerrada. Tentando reconectar em 5s...',
        );
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

  /**
   * Cria o Dead Letter Exchange (DLX) e a Dead Letter Queue (DLQ),
   * vinculando-os para que mensagens rejeitadas cheguem à DLQ.
   */
  private async setupDlq(): Promise<void> {
    if (!this.channel) return;

    // Exchange que recebe mensagens mortas (type fanout: roteia para todas as filas vinculadas)
    await this.channel.assertExchange(this.dlxExchange, 'fanout', {
      durable: true,
    });

    // Fila que armazena as mensagens mortas
    await this.channel.assertQueue(this.dlqQueue, { durable: true });

    // Vincula a DLQ ao DLX (routing key vazia para fanout)
    await this.channel.bindQueue(this.dlqQueue, this.dlxExchange, '');

    this.logger.log(`🪤 DLQ configurada — exchange: "${this.dlxExchange}", fila: "${this.dlqQueue}"`);
  }

  /**
   * Declara a fila principal apontando para o DLX.
   * Quando uma mensagem é nack'd com requeue=false, o RabbitMQ
   * a redireciona automaticamente para o DLX → DLQ.
   *
   * ATENÇÃO: se a fila já existir sem `x-dead-letter-exchange`,
   * será necessário deletá-la no broker antes do primeiro deploy.
   */
  private async setupMainQueue(): Promise<void> {
    if (!this.channel) return;

    try {
      await this.channel.assertQueue(this.queue, {
        durable: true,
        arguments: { 'x-dead-letter-exchange': this.dlxExchange },
      });
    } catch (err) {
      const error = err as Error & { code?: number };
      if (error.code === 406) {
        this.logger.warn(
          `Fila "${this.queue}" existe com argumentos diferentes. Recriando com DLQ...`,
        );
        // Channel was closed by the error — need a new one
        this.channel = await this.connection!.createChannel();
        await this.channel.deleteQueue(this.queue);
        await this.channel.assertQueue(this.queue, {
          durable: true,
          arguments: { 'x-dead-letter-exchange': this.dlxExchange },
        });
        this.logger.log(`✅ Fila "${this.queue}" recriada com DLQ.`);
      } else {
        throw err;
      }
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
   * Retorna se a conexão e o canal RabbitMQ estão ativos.
   */
  isHealthy(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  /**
   * Publica uma mensagem na fila principal.
   *
   * @param event   Nome do evento (ex: 'service.created')
   * @param payload Objeto com os dados do evento
   * @param options Opções internas (ex: retryCount para re-tentativas)
   */
  publish(
    event: string,
    payload: Record<string, unknown>,
    options?: { retryCount?: number },
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn(
        `Canal RabbitMQ indisponível. Evento "${event}" descartado.`,
      );
      return Promise.resolve();
    }

    const retryCount = options?.retryCount ?? 0;
    const message = Buffer.from(
      JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
    );

    this.channel.sendToQueue(this.queue, message, {
      persistent: true,
      contentType: 'application/json',
      headers: {
        'x-event-type': event,
        ...(retryCount > 0 ? { [RETRY_COUNT_HEADER]: retryCount } : {}),
      },
    });

    if (retryCount > 0) {
      this.logger.debug(`🔁 Evento re-tentado (${retryCount}/${MAX_RETRIES}): ${event}`);
    } else {
      this.logger.debug(`📤 Evento publicado: ${event}`);
    }

    return Promise.resolve();
  }

  /**
   * Registra um consumidor para processar mensagens da fila principal.
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
   * Registra um consumidor para processar mensagens da Dead Letter Queue.
   * Chamado pelo DeadLetterQueueConsumer.
   */
  async consumeDlq(handler: DlqHandler): Promise<void> {
    this.pendingDlqHandlers.push(handler);

    if (!this.channel) {
      this.logger.log(
        'Canal RabbitMQ ainda não aberto — DLQ consumer enfileirado.',
      );
      return;
    }

    await this.registerDlqHandlerOnChannel(handler);
  }

  private async flushPendingHandlers(): Promise<void> {
    if (!this.channel) return;

    for (const handler of this.pendingHandlers) {
      try {
        await this.registerHandlerOnChannel(handler);
      } catch (err) {
        this.logger.error(
          `Falha ao registrar consumer pendente: ${(err as Error).message}`,
        );
      }
    }

    for (const dlqHandler of this.pendingDlqHandlers) {
      try {
        await this.registerDlqHandlerOnChannel(dlqHandler);
      } catch (err) {
        this.logger.error(
          `Falha ao registrar DLQ consumer pendente: ${(err as Error).message}`,
        );
      }
    }
  }

  private async registerHandlerOnChannel(
    handler: ConsumerHandler,
  ): Promise<void> {
    if (!this.channel) return;

    await this.channel.prefetch(1);
    await this.channel.consume(this.queue, (msg) => {
      void this.processMessage(msg, handler);
    });

    this.logger.log(`👂 Consumer registrado na fila "${this.queue}"`);
  }

  private async registerDlqHandlerOnChannel(handler: DlqHandler): Promise<void> {
    if (!this.channel) return;

    await this.channel.consume(this.dlqQueue, (msg) => {
      void this.processDlqMessage(msg, handler);
    });

    this.logger.log(`👂 Consumer registrado na DLQ "${this.dlqQueue}"`);
  }

  /**
   * Processa uma mensagem da fila principal com lógica de retry.
   *
   * - Sucesso: ack
   * - Falha + retries restantes: re-publica com x-retry-count incrementado, ack original
   * - Falha + retries esgotados: nack(requeue=false) → RabbitMQ roteia para DLQ via DLX
   * - JSON mal-formado: nack imediato para DLQ (mensagem irrecuperável)
   */
  private async processMessage(
    msg: ConsumeMessage | null,
    handler: ConsumerHandler,
  ): Promise<void> {
    if (!msg) return;

    const retryCount =
      (msg.properties.headers?.[RETRY_COUNT_HEADER] as number | undefined) ?? 0;

    let parsed: { event: string; payload: Record<string, unknown> } | null = null;

    try {
      parsed = JSON.parse(msg.content.toString()) as {
        event: string;
        payload: Record<string, unknown>;
      };

      const { event, payload } = parsed;
      this.logger.debug(`📥 Evento recebido: ${event} (tentativa ${retryCount + 1}/${MAX_RETRIES})`);

      await handler(event, payload);
      this.channel?.ack(msg);
    } catch (err) {
      const errorMessage = (err as Error).message;

      if (parsed && retryCount < MAX_RETRIES - 1) {
        // Ainda há tentativas — re-publica com contador incrementado e ack o original
        this.logger.warn(
          `⚠️  Falha ao processar "${parsed.event}" (tentativa ${retryCount + 1}/${MAX_RETRIES}). Reagendando... Erro: ${errorMessage}`,
        );
        this.publish(parsed.event, parsed.payload, { retryCount: retryCount + 1 });
        this.channel?.ack(msg);
      } else {
        // Retries esgotados ou mensagem mal-formada → DLQ
        const reason = parsed
          ? `retries esgotados (${retryCount + 1}/${MAX_RETRIES})`
          : 'mensagem mal-formada (JSON inválido)';
        this.logger.error(
          `💀 Enviando para DLQ — ${reason}. Erro: ${errorMessage}`,
        );
        this.channel?.nack(msg, false, false);
      }
    }
  }

  /**
   * Processa uma mensagem que chegou na DLQ.
   * Loga o conteúdo completo e repassa o raw JSON ao handler externo
   * (DeadLetterQueueConsumer) para alertas e rastreamento.
   */
  private async processDlqMessage(
    msg: ConsumeMessage | null,
    handler: DlqHandler,
  ): Promise<void> {
    if (!msg) return;

    const raw = msg.content.toString();
    this.logger.error(`💀 Mensagem recebida na DLQ: ${raw}`);

    try {
      await handler(raw);
    } catch (err) {
      this.logger.error(
        `Erro no handler da DLQ: ${(err as Error).message}`,
      );
    } finally {
      // Sempre ack na DLQ — a mensagem foi registrada/alertada
      this.channel?.ack(msg);
    }
  }
}
