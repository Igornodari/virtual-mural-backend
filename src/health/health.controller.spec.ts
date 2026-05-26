import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService, HealthReport } from './health.service';

const makeReport = (overrides: Partial<HealthReport> = {}): HealthReport => ({
  status: 'ok',
  version: '0.0.1',
  uptime: 42,
  timestamp: '2026-01-01T00:00:00.000Z',
  services: {
    database: { status: 'ok', latencyMs: 2 },
    rabbitmq: { status: 'ok' },
  },
  ...overrides,
});

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: jest.Mocked<HealthService>;

  beforeEach(async () => {
    const mockHealthService: jest.Mocked<HealthService> = {
      check: jest.fn(),
    } as unknown as jest.Mocked<HealthService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get(HealthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /health', () => {
    it('should return 200 with status ok when all services are healthy', async () => {
      const report = makeReport();
      healthService.check.mockResolvedValue(report);

      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(report);
    });

    it('should return 200 with status degraded when rabbitmq is down', async () => {
      const report = makeReport({
        status: 'degraded',
        services: {
          database: { status: 'ok', latencyMs: 1 },
          rabbitmq: { status: 'error', error: 'disconnected' },
        },
      });
      healthService.check.mockResolvedValue(report);

      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      await controller.check(res);

      // Degradado mas ainda acessível — Railway não deve reiniciar o container
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(report);
    });

    it('should return 503 when database is down', async () => {
      const report = makeReport({
        status: 'error',
        services: {
          database: { status: 'error', error: 'connection refused' },
          rabbitmq: { status: 'ok' },
        },
      });
      healthService.check.mockResolvedValue(report);

      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(report);
    });
  });
});
