import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { AppointmentStatusService } from './appointment-status.service';
import { AppointmentQueryService } from './appointment-query.service';
import { AppointmentNotificationService } from './appointment-notification.service';
import { Appointment } from '../entities/appointment.entity';

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createMockRepo = <T>(): MockRepo<T> & {
  createQueryBuilder: jest.Mock;
} => ({
  findOne: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
});

/** Cria um Appointment fake com relacionamentos mínimos */
const makeAppointment = (overrides: Partial<Appointment> = {}): Appointment =>
  ({
    id: 'appt-uuid-1',
    customerId: 'customer-uuid',
    serviceId: 'service-uuid',
    status: 'pending',
    scheduledDate: '2030-12-01',
    scheduledDay: 'monday',
    scheduledTime: '09:00',
    service: {
      id: 'service-uuid',
      provider: { id: 'provider-uuid', email: 'provider@example.com' },
    },
    customer: { id: 'customer-uuid', email: 'customer@example.com' },
    ...overrides,
  }) as unknown as Appointment;

describe('AppointmentStatusService', () => {
  let service: AppointmentStatusService;
  let repo: ReturnType<typeof createMockRepo<Appointment>>;
  let queryService: { findOne: jest.Mock };
  let notificationService: { publishAppointmentStatusChanged: jest.Mock };

  beforeEach(async () => {
    repo = createMockRepo<Appointment>();
    queryService = { findOne: jest.fn() };
    notificationService = {
      publishAppointmentStatusChanged: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentStatusService,
        { provide: getRepositoryToken(Appointment), useValue: repo },
        { provide: AppointmentQueryService, useValue: queryService },
        {
          provide: AppointmentNotificationService,
          useValue: notificationService,
        },
      ],
    }).compile();

    service = module.get<AppointmentStatusService>(AppointmentStatusService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── updateStatus ────────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('deve confirmar um agendamento (pending → confirmed) pelo provider', async () => {
      const appointment = makeAppointment({ status: 'pending' });
      queryService.findOne.mockResolvedValue(appointment);

      // Sem conflito de agenda
      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      repo.createQueryBuilder.mockReturnValue(qbMock);
      repo.save!.mockResolvedValue({ ...appointment, status: 'confirmed' });

      const result = await service.updateStatus(
        'appt-uuid-1',
        { status: 'confirmed' },
        'provider-uuid',
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'confirmed' }),
      );
      expect(
        notificationService.publishAppointmentStatusChanged,
      ).toHaveBeenCalled();
      expect(result.status).toBe('confirmed');
    });

    it('deve lançar ForbiddenException se o solicitante não é o provider', async () => {
      const appointment = makeAppointment({ status: 'pending' });
      queryService.findOne.mockResolvedValue(appointment);

      await expect(
        service.updateStatus(
          'appt-uuid-1',
          { status: 'confirmed' },
          'outro-uuid',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('deve lançar BadRequestException em transição inválida (cancelled → confirmed)', async () => {
      const appointment = makeAppointment({ status: 'cancelled' });
      queryService.findOne.mockResolvedValue(appointment);

      await expect(
        service.updateStatus(
          'appt-uuid-1',
          { status: 'confirmed' },
          'provider-uuid',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se confirmar sem horário definido', async () => {
      const appointment = makeAppointment({
        status: 'pending',
        scheduledTime: null as unknown as string,
      });
      queryService.findOne.mockResolvedValue(appointment);

      await expect(
        service.updateStatus(
          'appt-uuid-1',
          { status: 'confirmed' },
          'provider-uuid',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se houver conflito de agenda ao confirmar', async () => {
      const appointment = makeAppointment({ status: 'pending' });
      queryService.findOne.mockResolvedValue(appointment);

      const qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest
          .fn()
          .mockResolvedValue(makeAppointment({ id: 'outro-appt' })),
      };
      repo.createQueryBuilder.mockReturnValue(qbMock);

      await expect(
        service.updateStatus(
          'appt-uuid-1',
          { status: 'confirmed' },
          'provider-uuid',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException ao tentar concluir antes do horário agendado', async () => {
      // Data no futuro distante
      const appointment = makeAppointment({
        status: 'paid',
        scheduledDate: '2099-01-01',
        scheduledTime: '09:00',
      });
      queryService.findOne.mockResolvedValue(appointment);

      await expect(
        service.updateStatus(
          'appt-uuid-1',
          { status: 'completed' },
          'provider-uuid',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve concluir um agendamento paid após o horário (past date)', async () => {
      const appointment = makeAppointment({
        status: 'paid',
        scheduledDate: '2020-01-01',
        scheduledTime: '09:00',
      });
      queryService.findOne.mockResolvedValue(appointment);
      repo.save!.mockResolvedValue({ ...appointment, status: 'completed' });

      const result = await service.updateStatus(
        'appt-uuid-1',
        { status: 'completed' },
        'provider-uuid',
      );

      expect(result.status).toBe('completed');
      expect(
        notificationService.publishAppointmentStatusChanged,
      ).toHaveBeenCalled();
    });
  });

  // ── cancelByCustomer ────────────────────────────────────────────────────────

  describe('cancelByCustomer', () => {
    it('deve cancelar um agendamento pending pelo cliente', async () => {
      const appointment = makeAppointment({ status: 'pending' });
      queryService.findOne.mockResolvedValue(appointment);
      repo.save!.mockResolvedValue({ ...appointment, status: 'cancelled' });

      const result = await service.cancelByCustomer(
        'appt-uuid-1',
        'customer-uuid',
      );

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
      );
      expect(result.status).toBe('cancelled');
    });

    it('deve lançar ForbiddenException se o solicitante não é o cliente', async () => {
      const appointment = makeAppointment({ status: 'pending' });
      queryService.findOne.mockResolvedValue(appointment);

      await expect(
        service.cancelByCustomer('appt-uuid-1', 'outro-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar BadRequestException ao tentar cancelar um agendamento paid', async () => {
      const appointment = makeAppointment({ status: 'paid' });
      queryService.findOne.mockResolvedValue(appointment);

      await expect(
        service.cancelByCustomer('appt-uuid-1', 'customer-uuid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve cancelar um agendamento awaiting_payment', async () => {
      const appointment = makeAppointment({ status: 'awaiting_payment' });
      queryService.findOne.mockResolvedValue(appointment);
      repo.save!.mockResolvedValue({ ...appointment, status: 'cancelled' });

      const result = await service.cancelByCustomer(
        'appt-uuid-1',
        'customer-uuid',
      );

      expect(result.status).toBe('cancelled');
    });
  });
});
