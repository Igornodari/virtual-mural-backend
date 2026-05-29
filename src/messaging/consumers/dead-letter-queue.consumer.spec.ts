/**
 * Testes unitários — DeadLetterQueueConsumer
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DeadLetterQueueConsumer } from './dead-letter-queue.consumer';
import { MessagingService } from '../messaging.service';
import { SentryReporter } from '../../sentry/sentry.reporter';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockMessagingService = {
  consumeDlq: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../sentry/sentry.reporter', () => ({
  SentryReporter: {
    capture: jest.fn(),
  },
}));

// ── Suíte ─────────────────────────────────────────────────────────────────────

describe('DeadLetterQueueConsumer', () => {
  let consumer: DeadLetterQueueConsumer;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterQueueConsumer,
        { provide: MessagingService, useValue: mockMessagingService },
      ],
    }).compile();

    consumer = module.get(DeadLetterQueueConsumer);
  });

  it('deve estar definido', () => {
    expect(consumer).toBeDefined();
  });

  describe('onModuleInit()', () => {
    it('deve registrar consumer na DLQ via MessagingService', async () => {
      await consumer.onModuleInit();

      expect(mockMessagingService.consumeDlq).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });
  });

  describe('handleDeadLetter()', () => {
    /**
     * Obtém o handler registrado via consumeDlq para testá-lo diretamente.
     */
    const getRegisteredHandler = async (
      svc: DeadLetterQueueConsumer,
    ): Promise<(raw: string) => Promise<void>> => {
      await svc.onModuleInit();
      const [handler] = mockMessagingService.consumeDlq.mock.calls[0] as [
        (raw: string) => Promise<void>,
      ];
      return handler;
    };

    it('deve capturar erro ao Sentry quando processa mensagem da DLQ', async () => {
      const handler = await getRegisteredHandler(consumer);

      const payload = JSON.stringify({
        event: 'test.event',
        payload: { id: '123' },
        timestamp: new Date().toISOString(),
        retryCount: 3,
      });

      await handler(payload);

      expect(SentryReporter.capture).toHaveBeenCalledWith(
        expect.any(Error),
      );
    });

    it('deve processar mensagem DLQ sem lançar exceção (não pode travar o consumer)', async () => {
      const handler = await getRegisteredHandler(consumer);

      await expect(
        handler(JSON.stringify({ event: 'fail.event', payload: {}, timestamp: '' })),
      ).resolves.not.toThrow();
    });

    it('deve tolerar payload mal-formado sem lançar exceção', async () => {
      const handler = await getRegisteredHandler(consumer);

      await expect(handler('invalid json')).resolves.not.toThrow();
    });
  });
});
