/**
 * SentryReporter — wrapper singleton em torno do SDK @sentry/nestjs.
 *
 * Por que singleton e não @Injectable?
 * Os filtros globais são instanciados via `new Filter()` em main.ts,
 * fora do container DI. Um singleton estático permite que todos os
 * filtros chamem `SentryReporter.capture()` sem precisar de injeção.
 *
 * O SDK é carregado via require() dinâmico para que a aplicação inicie
 * normalmente mesmo quando SENTRY_DSN não está configurado.
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('SentryReporter');

type CaptureExceptionFn = (error: unknown) => string;

let captureException: CaptureExceptionFn | null = null;

export const SentryReporter = {
  /**
   * Inicializa o SDK com o DSN fornecido.
   * Deve ser chamado em main.ts após a leitura de variáveis de ambiente.
   * Se o DSN não for fornecido, o reporter fica no-op (sem lançar erros).
   */
  initialize(dsn: string | undefined, environment = 'development'): void {
    if (!dsn) {
      logger.warn(
        'SENTRY_DSN não configurado — monitoramento de erros desabilitado.',
      );
      return;
    }

    try {
      // require() dinâmico: não falha em build se @sentry/nestjs não instalado
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/nestjs') as {
        init: (opts: Record<string, unknown>) => void;
        captureException: CaptureExceptionFn;
      };

      Sentry.init({
        dsn,
        environment,
        tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
      });

      captureException = (error) => Sentry.captureException(error);
      logger.log('✅ Sentry inicializado com sucesso.');
    } catch (err) {
      logger.warn(
        `Falha ao inicializar Sentry (SDK provavelmente não instalado): ${(err as Error).message}`,
      );
    }
  },

  /**
   * Envia a exceção ao Sentry.
   * No-op quando o reporter não foi inicializado (DSN ausente).
   */
  capture(error: unknown): void {
    captureException?.(error);
  },

  /** Retorna true quando o SDK está ativo (útil em testes e health check). */
  isEnabled(): boolean {
    return captureException !== null;
  },

  /**
   * Reseta o estado interno — usar APENAS em testes.
   * @internal
   */
  _reset(): void {
    captureException = null;
  },
};
