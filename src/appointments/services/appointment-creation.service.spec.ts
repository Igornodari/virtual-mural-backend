import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { AppointmentCreationService } from './appointment-creation.service';
import { AppointmentNotificationService } from './appointment-notification.service';
import { Appointment } from '../entities/appointment.entity';
import { Service } from '../../services/entities/service.entity';
import { User } from '../../users/entities/user.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeCustomer = (overrides: Partial<User> = {}): User =>
  ({
    id: 'customer-uuid',
    email: 'customer@example.com',
    condominiumId: 'condo-uuid',
    displayName: 'João Cliente',
    phone: '11999999999',
    ...overrides,
  }) as unknown as User;

const makeService = (overrides: Partial<Service> = {}): Service =>
  ({
    id: 'service-uuid',
    name: 'Pintura',
    isActive: true,
    providerId: 'provider-uuid',
    condominiumId: 'condo-uuid',
    availableDays: ['monday', 'tuesday', 'wednesday'],
    availabilitySlots: [],
    provider: { id: 'provider-uuid', email: 'provider@example.com' },
    ...overrides,
  }) as unknown as Service;

const makeDto = (overrides: Record<string, unknown> = {}) => ({
  serviceId: 'service-uuid',
  scheduledDate: '2030-12-01',
  scheduledTime: '09:00',
  scheduledDay: 'monday',
  notes: 'Sem notas',
  ...overrides,
});

// ── Transaction mock ──────────────────────────────────────────────────────────

function buildTransactionMock(
  serviceManagerRepo: { findOne: jest.Mock },
  apptManagerRepo: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  },
) {
  const mockEntityManager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Service) return serviceManagerRepo;
      if (entity === Appointment) return apptManagerRepo;
      return {};
    }),
  };

  return jest
    .fn()
    .mockImplementation((cb: (em: unknown) => Promise<unknown>) =>
      cb(mockEntityManager),
    );
}

describe('AppointmentCreationService', () => {
  let service: AppointmentCreationService;

  let serviceManagerRepo: { findOne: jest.Mock };
  let apptManagerRepo: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let appointmentsRepo: {
    manager: { transaction: jest.Mock };
  };
  let notificationService: {
    publishAppointmentRequested: jest.Mock;
  };

  // QueryBuilder mock encadeável para conflito de agendamento
  const makeQbMock = (result: unknown = null) => ({
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
  });

  beforeEach(async () => {
    serviceManagerRepo = { findOne: jest.fn() };
    apptManagerRepo = {
      createQueryBuilder: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const transactionMock = buildTransactionMock(
      serviceManagerRepo,
      apptManagerRepo,
    );

    appointmentsRepo = {
      manager: { transaction: transactionMock },
    };

    notificationService = {
      publishAppointmentRequested: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentCreationService,
        {
          provide: getRepositoryToken(Appointment),
          useValue: appointmentsRepo,
        },
        { provide: getRepositoryToken(Service), useValue: {} },
        {
          provide: AppointmentNotificationService,
          useValue: notificationService,
        },
      ],
    }).compile();

    service = module.get<AppointmentCreationService>(
      AppointmentCreationService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── create — caminho feliz ──────────────────────────────────────────────────

  it('deve criar e salvar um agendamento com sucesso', async () => {
    const customer = makeCustomer();
    const svc = makeService();
    const newAppointment = {
      id: 'appt-new',
      customerId: customer.id,
      serviceId: svc.id,
      status: 'pending',
    } as unknown as Appointment;

    serviceManagerRepo.findOne
      .mockResolvedValueOnce(svc) // busca sem relations (validação)
      .mockResolvedValueOnce({ ...svc, provider: svc.provider }); // busca com relations (notificação)

    apptManagerRepo.createQueryBuilder.mockReturnValue(makeQbMock(null));
    apptManagerRepo.create.mockReturnValue(newAppointment);
    apptManagerRepo.save.mockResolvedValue(newAppointment);

    const result = await service.create(makeDto() as never, customer);

    expect(apptManagerRepo.save).toHaveBeenCalled();
    expect(
      notificationService.publishAppointmentRequested,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        appointment: newAppointment,
        customer,
      }),
    );
    expect(result).toBe(newAppointment);
  });

  // ── create — ForbiddenException ─────────────────────────────────────────────

  it('deve lançar ForbiddenException se o cliente não tem condominiumId', async () => {
    const customer = makeCustomer({ condominiumId: null as unknown as string });

    await expect(service.create(makeDto() as never, customer)).rejects.toThrow(
      ForbiddenException,
    );
    expect(appointmentsRepo.manager.transaction).not.toHaveBeenCalled();
  });

  it('deve lançar ForbiddenException se o cliente tentar agendar seu próprio serviço', async () => {
    const customer = makeCustomer({ id: 'provider-uuid' }); // mesmo id do provider
    const svc = makeService(); // providerId = 'provider-uuid'

    serviceManagerRepo.findOne.mockResolvedValueOnce(svc);
    apptManagerRepo.createQueryBuilder.mockReturnValue(makeQbMock(null));

    await expect(service.create(makeDto() as never, customer)).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ── create — BadRequestException ───────────────────────────────────────────

  it('deve lançar BadRequestException se a data não for informada', async () => {
    const customer = makeCustomer();

    await expect(
      service.create(makeDto({ scheduledDate: '' }) as never, customer),
    ).rejects.toThrow(BadRequestException);
  });

  it('deve lançar BadRequestException se o horário não for informado', async () => {
    const customer = makeCustomer();

    await expect(
      service.create(makeDto({ scheduledTime: null }) as never, customer),
    ).rejects.toThrow(BadRequestException);
  });

  it('deve lançar BadRequestException se o serviço estiver inativo', async () => {
    const customer = makeCustomer();
    serviceManagerRepo.findOne.mockResolvedValueOnce(
      makeService({ isActive: false }),
    );
    apptManagerRepo.createQueryBuilder.mockReturnValue(makeQbMock(null));

    await expect(service.create(makeDto() as never, customer)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('deve lançar BadRequestException se o dia solicitado não estiver disponível', async () => {
    const customer = makeCustomer();
    const svc = makeService({ availableDays: ['friday'] }); // apenas sexta
    serviceManagerRepo.findOne.mockResolvedValueOnce(svc);
    apptManagerRepo.createQueryBuilder.mockReturnValue(makeQbMock(null));

    // dto usa 'monday' que não está disponível
    await expect(
      service.create(makeDto({ scheduledDay: 'monday' }) as never, customer),
    ).rejects.toThrow(BadRequestException);
  });

  it('deve lançar BadRequestException se já existe conflito de agendamento', async () => {
    const customer = makeCustomer();
    const svc = makeService();
    const conflicting = { id: 'appt-existing', status: 'confirmed' };

    serviceManagerRepo.findOne.mockResolvedValueOnce(svc);
    apptManagerRepo.createQueryBuilder.mockReturnValue(makeQbMock(conflicting));

    await expect(service.create(makeDto() as never, customer)).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── create — NotFoundException ──────────────────────────────────────────────

  it('deve lançar NotFoundException se o serviço não existir', async () => {
    const customer = makeCustomer();
    serviceManagerRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.create(makeDto() as never, customer)).rejects.toThrow(
      NotFoundException,
    );
  });
});
