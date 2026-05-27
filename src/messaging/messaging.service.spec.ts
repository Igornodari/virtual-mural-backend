/**
 * Testes unitários — MessagingService
 *
 * Cobrem o comportamento de retry e roteamento para DLQ,
 * sem conexão real com o RabbitMQ (mocks de amqplib).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MessagingService } from './messaging.service';

// ── Mock amqplib ──────────────────────────────────────────────────────────────

const mockChannel = {
  assertExchange: jest.fn().mockResolvedValue(undefined),
  assertQueue: jest.fn().mockResolvedValue({ queue: 'virtual_mural_queue' }),
  bindQueue: jest.fn().mockResolvedValue(undefined),
  prefetch: jest.fn().mockResolvedValue(undefined),
  consume: jest.fn().mockResolvedValue(undefined),
  sendToQueue: jest.fn().mockReturnValue(true),
  publish: jest.fn().mockReturnValue(true),
  ack: jest.fn(),
  nack: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockConnection = {
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue(mockConnection),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMsg(
  event: string,
  payload: Record<string, unknown>,
  retryCount = 0,
) {
  return {
    content: Buffer.from(JSON.stringify({ event, payload, timestamp: new Date().toISOString() })),
    properties: {
      headers: retryCount > 0 ? { 'x-retry-count': retryCount } : {},
    },
    fields: { deliveryTag: 1 },
  };
}

// ── Suíte ─────────────────────────────────────────────────────────────────────

describe('MessagingService', () => {
  let service: MessagingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) => {
              const config: Record<string, string> = {
                RABBITMQ_URL: 'amqp://localhost',
                RABBITMQ_QUEUE: 'virtual_mural_queue',
                RABBITMQ_DLX_EXCHANGE: 'virtual_mural_dlx',
                RABBITMQ_DLQ_QUEUE: 'virtual_mural_dlq',
              };
              return config[key] ?? fallback;
            },
          },
        },
      ],
    }).compile();

    service = module.get(MessagingService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // ── Infraestrutura ────────────────────────────────────────────────────────

  describe('setup de infraestrutura RabbitMQ', () => {
    it('deve criar o DLX exchange ao conectar', () => {
      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'virtual_mural_dlx',
        'fanout',
        { durable: true },
      );
    });

    it('deve criar a DLQ queue ao conectar', () => {
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'virtual_mural_dlq',
        { durable: true },
      );
    });

    it('deve fazer bind da DLQ queue ao DLX exchange', () => {
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'virtual_mural_dlq',
        'virtual_mural_dlx',
        '',
      );
    });

    it('deve declarar fila principal com x-dead-letter-exchange', () => {
      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'virtual_mural_queue',
        {
          durable: true,
          arguments: { 'x-dead-letter-exchange': 'virtual_mural_dlx' },
        },
      );
    });
  });

  // ── isHealthy ─────────────────────────────────────────────────────────────

  describe('isHealthy()', () => {
    it('deve retornar true quando conectado', () => {
      expect(service.isHealthy()).toBe(true);
    });
  });

  // ── publish ───────────────────────────────────────────────────────────────

  describe('publish()', () => {
    it('deve enviar mensagem para a fila com persistent=true', async () => {
      await service.publish('test.event', { foo: 'bar' });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'virtual_mural_queue',
        expect.any(Buffer),
        expect.objectContaining({ persistent: true }),
      );
    });

    it('deve serializar event e payload no conteúdo da mensagem', async () => {
      await service.publish('test.event', { id: '123' });

      const [, buffer] = mockChannel.sendToQueue.mock.calls[0] as [
        string,
        Buffer,
        object,
      ];
      const parsed = JSON.parse(buffer.toString()) as {
        event: string;
        payload: Record<string, unknown>;
      };

      expect(parsed.event).toBe('test.event');
      expect(parsed.payload).toEqual({ id: '123' });
    });
  });

  // ── processMessage — retry e DLQ ─────────────────────────────────────────

  describe('processMessage() — retry e DLQ', () => {
    /**
     * Acessa o método privado via cast para testar o comportamento
     * sem precisar de uma conexão real.
     */
    const callProcessMessage = (
      svc: MessagingService,
      msg: ReturnType<typeof makeMsg>,
      handler: jest.Mock,
    ) =>
      (
        svc as unknown as {
          processMessage: (
            msg: ReturnType<typeof makeMsg>,
            handler: jest.Mock,
          ) => Promise<void>;
        }
      ).processMessage(msg, handler);

    it('deve ack a mensagem quando o handler tem sucesso', async () => {
      const msg = makeMsg('test.event', { id: '1' });
      const handler = jest.fn().mockResolvedValue(undefined);

      await callProcessMessage(service, msg, handler);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('deve re-publicar com x-retry-count incrementado na primeira falha', async () => {
      const msg = makeMsg('test.event', { id: '1' }, 0); // primeira tentativa
      const handler = jest.fn().mockRejectedValue(new Error('falha temporária'));

      await callProcessMessage(service, msg, handler);

      // Deve ter ackado o original e re-publicado com retry count = 1
      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'virtual_mural_queue',
        expect.any(Buffer),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-retry-count': 1 }),
        }),
      );
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('deve re-publicar na segunda falha (retry count < maxRetries)', async () => {
      const msg = makeMsg('test.event', { id: '1' }, 1); // segunda tentativa
      const handler = jest.fn().mockRejectedValue(new Error('falha'));

      await callProcessMessage(service, msg, handler);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'virtual_mural_queue',
        expect.any(Buffer),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-retry-count': 2 }),
        }),
      );
    });

    it('deve nack para DLQ quando retries esgotados (terceira falha)', async () => {
      const msg = makeMsg('test.event', { id: '1' }, 2); // terceira tentativa
      const handler = jest.fn().mockRejectedValue(new Error('falha persistente'));

      await callProcessMessage(service, msg, handler);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
      // Não deve tentar re-publicar
      expect(mockChannel.sendToQueue).not.toHaveBeenCalled();
    });

    it('deve nack imediatamente para DLQ quando mensagem é mal-formada (JSON inválido)', async () => {
      const malformedMsg = {
        content: Buffer.from('invalid json {{'),
        properties: { headers: {} },
        fields: { deliveryTag: 2 },
      };
      const handler = jest.fn();

      await callProcessMessage(
        service,
        malformedMsg as unknown as ReturnType<typeof makeMsg>,
        handler,
      );

      expect(mockChannel.nack).toHaveBeenCalledWith(
        malformedMsg,
        false,
        false,
      );
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── consumeDlq ────────────────────────────────────────────────────────────

  describe('consumeDlq()', () => {
    it('deve registrar consumer na DLQ queue', async () => {
      const dlqHandler = jest.fn().mockResolvedValue(undefined);
      await service.consumeDlq(dlqHandler);

      // consume foi chamado com a fila DLQ
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'virtual_mural_dlq',
        expect.any(Function),
      );
    });
  });
});
