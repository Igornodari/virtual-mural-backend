import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { AppointmentAvailabilityService } from './appointment-availability.service';
import { AppointmentQueryService } from './appointment-query.service';
import { Appointment } from '../entities/appointment.entity';
import { Service } from '../../services/entities/service.entity';
import { User } from '../../users/entities/user.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'customer-uuid',
    email: 'customer@example.com',
    condominiumId: 'condo-uuid',
    ...overrides,
  }) as unknown as User;

const makeService = (overrides: Partial<Service> = {}): Service =>
  ({
    id: 'service-uuid',
    name: 'Pintura',
    isActive: true,
    providerId: 'provider-uuid',
    condominiumId: 'condo-uuid',
    availableDays: ['monday', 'tuesday'],
    availabilitySlots: [],
    ...overrides,
  }) as unknown as Service;

describe('AppointmentAvailabilityService', () => {
  let service: AppointmentAvailabilityService;
  let servicesRepo: { findOne: jest.Mock };
  let appointmentsRepo: { createQueryBuilder: jest.Mock };
  let queryService: { findByServiceRaw: jest.Mock };

  // Cria um mock de QueryBuilder encadeável para getRawMany
  const makeQbRawMock = (rawResult: unknown[] = []) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rawResult),
  });

  beforeEach(async () => {
    servicesRepo = { findOne: jest.fn() };
    appointmentsRepo = { createQueryBuilder: jest.fn() };
    queryService = { findByServiceRaw: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentAvailabilityService,
        {
          provide: getRepositoryToken(Appointment),
          useValue: appointmentsRepo,
        },
        { provide: getRepositoryToken(Service), useValue: servicesRepo },
        { provide: AppointmentQueryService, useValue: queryService },
      ],
    }).compile();

    service = module.get<AppointmentAvailabilityService>(
      AppointmentAvailabilityService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── findByService — NotFoundException ──────────────────────────────────────

  it('deve lançar NotFoundException se o serviço não existir', async () => {
    servicesRepo.findOne.mockResolvedValue(null);
    const user = makeUser();

    await expect(service.findByService('inexistente', user)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── findByService — visão do provider ──────────────────────────────────────

  it('deve retornar lista raw de agendamentos para o próprio provider', async () => {
    const svc = makeService({ providerId: 'provider-uuid' });
    const rawList = [{ id: 'appt-1' }] as unknown as Appointment[];

    servicesRepo.findOne.mockResolvedValue(svc);
    queryService.findByServiceRaw.mockResolvedValue(rawList);

    const provider = makeUser({ id: 'provider-uuid' });
    const result = await service.findByService('service-uuid', provider);

    expect(queryService.findByServiceRaw).toHaveBeenCalledWith('service-uuid');
    expect(result).toBe(rawList);
  });

  // ── findByService — visão do cliente do mesmo condomínio ──────────────────

  it('deve retornar disponibilidade com slots bloqueados para morador do mesmo condo', async () => {
    const svc = makeService();
    servicesRepo.findOne.mockResolvedValue(svc);

    // Sem slots bloqueados — lista vazia
    appointmentsRepo.createQueryBuilder.mockReturnValue(makeQbRawMock([]));

    const customer = makeUser({
      id: 'customer-uuid',
      condominiumId: 'condo-uuid',
    });
    const result = (await service.findByService(
      'service-uuid',
      customer,
    )) as Record<string, unknown>;

    expect(result).toHaveProperty('serviceId', 'service-uuid');
    expect(result).toHaveProperty('timeSlots');
    expect(result).toHaveProperty('blockedDates');
    expect(result).toHaveProperty('blockedSlots');
    expect(Array.isArray(result.timeSlots)).toBe(true);
  });

  it('deve incluir slot bloqueado quando um horário está ocupado', async () => {
    const svc = makeService();
    servicesRepo.findOne.mockResolvedValue(svc);

    const blockedRow = {
      scheduledDate: '2030-12-01',
      scheduledTime: '09:00',
    };
    appointmentsRepo.createQueryBuilder.mockReturnValue(
      makeQbRawMock([blockedRow]),
    );

    const customer = makeUser({ condominiumId: 'condo-uuid' });
    const result = (await service.findByService(
      'service-uuid',
      customer,
    )) as Record<string, unknown>;

    const blockedSlots = result.blockedSlots as Array<{
      date: string;
      time: string | null;
    }>;
    expect(
      blockedSlots.some((s) => s.date === '2030-12-01' && s.time === '09:00'),
    ).toBe(true);
  });

  it('expande o intervalo (duração+pausa): 09:00 confirmado bloqueia 09/10/11, mas não 12:00', async () => {
    const svc = makeService({
      durationMinutes: 60,
      breakBetweenAppointmentsMinutes: 120, // passo total 180 min
    });
    servicesRepo.findOne.mockResolvedValue(svc);

    appointmentsRepo.createQueryBuilder.mockReturnValue(
      makeQbRawMock([{ scheduledDate: '2030-12-01', scheduledTime: '09:00' }]),
    );

    const customer = makeUser({ condominiumId: 'condo-uuid' });
    const result = (await service.findByService(
      'service-uuid',
      customer,
    )) as Record<string, unknown>;

    const blockedTimes = (
      result.blockedSlots as Array<{ date: string; time: string | null }>
    )
      .filter((s) => s.date === '2030-12-01')
      .map((s) => s.time);

    expect(blockedTimes).toContain('09:00');
    expect(blockedTimes).toContain('10:00');
    expect(blockedTimes).toContain('11:00');
    expect(blockedTimes).not.toContain('12:00');
  });

  it('marca o dia inteiro quando todos os horários ficam bloqueados', async () => {
    const svc = makeService(); // grade = DEFAULT (09..18), passo 60
    servicesRepo.findOne.mockResolvedValue(svc);

    const allRows = [
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
    ].map((time) => ({ scheduledDate: '2030-12-01', scheduledTime: time }));
    appointmentsRepo.createQueryBuilder.mockReturnValue(makeQbRawMock(allRows));

    const customer = makeUser({ condominiumId: 'condo-uuid' });
    const result = (await service.findByService(
      'service-uuid',
      customer,
    )) as Record<string, unknown>;

    expect(result.blockedDates).toContain('2030-12-01');
    expect(
      (
        result.blockedSlots as Array<{ date: string; time: string | null }>
      ).some((s) => s.date === '2030-12-01' && s.time === null),
    ).toBe(true);
  });

  // ── findByService — ForbiddenException ─────────────────────────────────────

  it('deve lançar ForbiddenException para morador de condomínio diferente', async () => {
    const svc = makeService({ condominiumId: 'condo-uuid' });
    servicesRepo.findOne.mockResolvedValue(svc);

    const outsider = makeUser({ condominiumId: 'outro-condo' });

    await expect(
      service.findByService('service-uuid', outsider),
    ).rejects.toThrow(ForbiddenException);
  });

  it('deve lançar ForbiddenException para usuário sem condominiumId', async () => {
    const svc = makeService();
    servicesRepo.findOne.mockResolvedValue(svc);

    const noCondoUser = makeUser({ condominiumId: null as unknown as string });

    await expect(
      service.findByService('service-uuid', noCondoUser),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── findServiceBlockedSlots — direto ───────────────────────────────────────

  it('findServiceBlockedSlots deve mapear linhas cruas em BlockedSlot[]', async () => {
    const rows = [
      { scheduledDate: '2030-12-01', scheduledTime: '10:00' },
      { scheduledDate: '2030-12-02', scheduledTime: '11:30' },
    ];
    appointmentsRepo.createQueryBuilder.mockReturnValue(makeQbRawMock(rows));

    const result = await service.findServiceBlockedSlots('service-uuid');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '2030-12-01', time: '10:00' });
    expect(result[1]).toEqual({ date: '2030-12-02', time: '11:30' });
  });

  it('findServiceBlockedSlots deve ignorar linhas com data ou horário inválidos', async () => {
    const rows = [
      { scheduledDate: null, scheduledTime: '10:00' }, // data inválida
      { scheduledDate: '2030-12-01', scheduledTime: null }, // hora inválida
    ];
    appointmentsRepo.createQueryBuilder.mockReturnValue(makeQbRawMock(rows));

    const result = await service.findServiceBlockedSlots('service-uuid');

    expect(result).toHaveLength(0);
  });
});
