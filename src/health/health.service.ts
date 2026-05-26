import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagingService } from '../messaging/messaging.service';

export interface ServiceStatus {
  status: 'ok' | 'error';
  latencyMs?: number;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    database: ServiceStatus;
    rabbitmq: ServiceStatus;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  // Lida com ausência do MessagingService (caso não esteja disponível no ambiente)
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly messagingService: MessagingService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, rabbitmq] = await Promise.all([
      this.checkDatabase(),
      Promise.resolve(this.checkRabbitMQ()),
    ]);

    const hasError = database.status === 'error';
    const hasDegraded = rabbitmq.status === 'error';

    const overallStatus = hasError ? 'error' : hasDegraded ? 'degraded' : 'ok';

    return {
      status: overallStatus,
      version: process.env.npm_package_version ?? '0.0.1',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services: { database, rabbitmq },
    };
  }

  private async checkDatabase(): Promise<ServiceStatus> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error(
        'Database health check falhou:',
        (err as Error).message,
      );
      return { status: 'error', error: (err as Error).message };
    }
  }

  private checkRabbitMQ(): ServiceStatus {
    try {
      const healthy = this.messagingService.isHealthy();
      return healthy
        ? { status: 'ok' }
        : { status: 'error', error: 'disconnected' };
    } catch (err) {
      return { status: 'error', error: (err as Error).message };
    }
  }
}
