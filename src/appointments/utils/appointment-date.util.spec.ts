import {
  getWeekdayLabelFromDateKey,
  hasAppointmentDateTimePassed,
  toDateKey,
  toTimeKey,
} from './appointment-date.util';

describe('appointment-date.util', () => {
  // ── toDateKey ────────────────────────────────────────────────────────────

  describe('toDateKey', () => {
    it('deve retornar string vazia para null', () => {
      expect(toDateKey(null)).toBe('');
    });

    it('deve retornar string vazia para undefined', () => {
      expect(toDateKey(undefined)).toBe('');
    });

    it('deve formatar Date para YYYY-MM-DD', () => {
      expect(toDateKey(new Date('2025-03-15T10:00:00'))).toBe('2025-03-15');
    });

    it('deve preencher mês e dia com zero à esquerda', () => {
      expect(toDateKey(new Date('2025-01-05T00:00:00'))).toBe('2025-01-05');
    });

    it('deve extrair os primeiros 10 caracteres de uma string ISO', () => {
      expect(toDateKey('2025-07-20T14:30:00.000Z')).toBe('2025-07-20');
    });

    it('deve retornar a string já no formato correto sem modificar', () => {
      expect(toDateKey('2025-12-31')).toBe('2025-12-31');
    });
  });

  // ── toTimeKey ────────────────────────────────────────────────────────────

  describe('toTimeKey', () => {
    it('deve retornar null para null', () => {
      expect(toTimeKey(null)).toBeNull();
    });

    it('deve retornar null para undefined', () => {
      expect(toTimeKey(undefined)).toBeNull();
    });

    it('deve extrair HH:mm de uma string de tempo completa', () => {
      expect(toTimeKey('14:30:00')).toBe('14:30');
    });

    it('deve retornar os primeiros 5 caracteres exatos', () => {
      expect(toTimeKey('09:00')).toBe('09:00');
    });
  });

  // ── getWeekdayLabelFromDateKey ────────────────────────────────────────────

  describe('getWeekdayLabelFromDateKey', () => {
    it('deve retornar Domingo para uma data que cai no domingo (UTC)', () => {
      expect(getWeekdayLabelFromDateKey('2025-01-05')).toBe('Domingo');
    });

    it('deve retornar Segunda-feira corretamente', () => {
      expect(getWeekdayLabelFromDateKey('2025-01-06')).toBe('Segunda-feira');
    });

    it('deve retornar Sábado corretamente', () => {
      expect(getWeekdayLabelFromDateKey('2025-01-11')).toBe('Sábado');
    });

    it('deve retornar string vazia para data inválida', () => {
      expect(getWeekdayLabelFromDateKey('invalid-date')).toBe('');
    });
  });

  // ── hasAppointmentDateTimePassed ──────────────────────────────────────────

  describe('hasAppointmentDateTimePassed', () => {
    it('deve retornar false quando dateKey é vazio', () => {
      expect(hasAppointmentDateTimePassed('', '10:00')).toBe(false);
    });

    it('deve retornar false quando timeKey é null', () => {
      expect(hasAppointmentDateTimePassed('2025-01-01', null)).toBe(false);
    });

    it('deve retornar true para data/hora no passado', () => {
      expect(hasAppointmentDateTimePassed('2020-01-01', '08:00')).toBe(true);
    });

    it('deve retornar false para data/hora no futuro', () => {
      expect(hasAppointmentDateTimePassed('2099-12-31', '23:59')).toBe(false);
    });

    it('deve aceitar Date como primeiro argumento', () => {
      expect(hasAppointmentDateTimePassed(new Date('2020-06-15'), '10:00')).toBe(true);
    });
  });
});
