import { Service } from '../../services/entities/service.entity';
import { DEFAULT_SERVICE_TIME_SLOTS } from '../constants/appointment-availability.contants';
import {
  generateHourlySlots,
  normalizeDay,
  resolveTimeSlotsForDay,
} from './appointment-time-slots.util';

describe('appointment-time-slots.util', () => {
  // ── normalizeDay ──────────────────────────────────────────────────────────

  describe('normalizeDay', () => {
    it('deve converter para minúsculas', () => {
      expect(normalizeDay('Segunda-feira')).toBe('segunda-feira');
    });

    it('deve remover espaços extras', () => {
      expect(normalizeDay('  sábado  ')).toBe('sábado');
    });

    it('deve manter strings já normalizadas', () => {
      expect(normalizeDay('domingo')).toBe('domingo');
    });
  });

  // ── generateHourlySlots ───────────────────────────────────────────────────

  describe('generateHourlySlots', () => {
    it('deve gerar slots de 09:00 a 12:00', () => {
      expect(generateHourlySlots('09:00', '12:00')).toEqual([
        '09:00',
        '10:00',
        '11:00',
        '12:00',
      ]);
    });

    it('deve retornar um único slot quando início = fim', () => {
      expect(generateHourlySlots('14:00', '14:00')).toEqual(['14:00']);
    });

    it('deve retornar array vazio se startHour > endHour', () => {
      expect(generateHourlySlots('17:00', '09:00')).toEqual([]);
    });

    it('deve retornar array vazio para valores não numéricos', () => {
      expect(generateHourlySlots('xx:00', '17:00')).toEqual([]);
    });

    it('deve formatar hora com zero à esquerda', () => {
      expect(generateHourlySlots('08:00', '09:00')).toEqual(['08:00', '09:00']);
    });
  });

  // ── resolveTimeSlotsForDay ────────────────────────────────────────────────

  describe('resolveTimeSlotsForDay', () => {
    const baseService = { id: 'svc-1', name: 'Teste' } as Service;

    it('deve retornar DEFAULT_SERVICE_TIME_SLOTS quando não há availabilitySlots', () => {
      const result = resolveTimeSlotsForDay(baseService, 'segunda-feira');
      expect(result).toEqual(DEFAULT_SERVICE_TIME_SLOTS);
    });

    it('deve retornar DEFAULT_SERVICE_TIME_SLOTS quando availabilitySlots é array vazio', () => {
      const service = {
        ...baseService,
        availabilitySlots: [],
      } as unknown as Service;
      expect(resolveTimeSlotsForDay(service, 'segunda-feira')).toEqual(
        DEFAULT_SERVICE_TIME_SLOTS,
      );
    });

    it('deve retornar slots do dia correspondente', () => {
      const service = {
        ...baseService,
        availabilitySlots: [
          { day: 'Segunda-feira', startTime: '09:00', endTime: '11:00' },
        ],
      } as unknown as Service;

      const result = resolveTimeSlotsForDay(service, 'segunda-feira');
      expect(result).toEqual(['09:00', '10:00', '11:00']);
    });

    it('deve ser case-insensitive na comparação de dias', () => {
      const service = {
        ...baseService,
        availabilitySlots: [
          { day: 'SEXTA-FEIRA', startTime: '08:00', endTime: '09:00' },
        ],
      } as unknown as Service;

      expect(resolveTimeSlotsForDay(service, 'Sexta-feira')).toEqual([
        '08:00',
        '09:00',
      ]);
    });

    it('deve retornar DEFAULT quando não há slot para o dia solicitado', () => {
      const service = {
        ...baseService,
        availabilitySlots: [
          { day: 'domingo', startTime: '09:00', endTime: '10:00' },
        ],
      } as unknown as Service;

      expect(resolveTimeSlotsForDay(service, 'segunda-feira')).toEqual(
        DEFAULT_SERVICE_TIME_SLOTS,
      );
    });

    it('deve retornar slots ordenados quando há múltiplos intervalos no mesmo dia', () => {
      const service = {
        ...baseService,
        availabilitySlots: [
          { day: 'terça-feira', startTime: '14:00', endTime: '15:00' },
          { day: 'terça-feira', startTime: '09:00', endTime: '10:00' },
        ],
      } as unknown as Service;

      const result = resolveTimeSlotsForDay(service, 'terça-feira');
      expect(result).toEqual(['09:00', '10:00', '14:00', '15:00']);
    });

    it('deve ignorar slots sem startTime ou endTime', () => {
      const service = {
        ...baseService,
        availabilitySlots: [
          { day: 'quarta-feira', startTime: null, endTime: null },
        ],
      } as unknown as Service;

      expect(resolveTimeSlotsForDay(service, 'quarta-feira')).toEqual(
        DEFAULT_SERVICE_TIME_SLOTS,
      );
    });

    it('deve ignorar slots sem day definido', () => {
      const service = {
        ...baseService,
        availabilitySlots: [
          { day: null, startTime: '09:00', endTime: '10:00' },
        ],
      } as unknown as Service;

      expect(resolveTimeSlotsForDay(service, 'segunda-feira')).toEqual(
        DEFAULT_SERVICE_TIME_SLOTS,
      );
    });
  });
});
