import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, IsNull } from 'typeorm';
import { Appointment } from '../entities/appointment.entity';
import { MessagingService } from '../../messaging/messaging.service';
import { MuralEvents } from '../../messaging/events/mural.events';

/**
 * Scheduler de lembretes de agendamento (Cenário 9).
 *
 * Roda a cada hora, busca agendamentos com status `confirmed`/`paid`
 * que acontecem entre 1h e 4h no futuro, e que ainda não receberam
 * lembrete (`reminderSentAt IS NULL`). Para cada um:
 *  - publica MuralEvents.APPOINTMENT_REMINDER (notifica customer + provider)
 *  - marca `reminderSentAt = now()` para idempotência
 *
 * Janela de 1h–4h foi escolhida porque:
 *  - mais cedo (24h) seria perder utilidade do "está chegando"
 *  - mais tarde (15min) corre risco de o cron não pegar a janela
 *
 * Para tornar este scheduler ativo em produção:
 *  1. Instalar `@nestjs/schedule`
 *  2. Adicionar `ScheduleModule.forRoot()` no AppModule
 *  3. Garantir DB_SYNC ou rodar migration para criar `reminderSentAt`
 *
 * Em ambientes multi-instância considere usar lock distribuído
 * (advisory lock do Postgres ou Redis) para evitar disparos duplicados.
 */
@Injectable()
export class AppointmentReminderScheduler {
  private readonly logger = new Logger(AppointmentReminderScheduler.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    private readonly messaging: MessagingService,
  ) {}

  /**
   * Roda no minuto 5 de cada hora — desencontrado dos jobs comuns que
   * costumam usar minuto 0, reduzindo contenção em ambientes com
   * múltiplos crons.
   */
  @Cron('5 * * * *', { name: 'appointment-reminder' })
  async runReminderSweep(): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() + 60 * 60 * 1000); // +1h
    const windowEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4h

    // Busca por scheduledDate (DATE) — não temos coluna timestamp
    // completa. Filtramos depois em memória pelo scheduledTime para
    // garantir que cai na janela exata.
    const todayIso = now.toISOString().slice(0, 10);
    const tomorrowIso = new Date(now.getTime() + 86400000)
      .toISOString()
      .slice(0, 10);

    const candidates = await this.appointmentsRepo.find({
      where: [
        {
          scheduledDate: Between(todayIso, tomorrowIso),
          status: 'confirmed',
          reminderSentAt: IsNull(),
        },
        {
          scheduledDate: Between(todayIso, tomorrowIso),
          status: 'paid',
          reminderSentAt: IsNull(),
        },
      ],
      relations: ['customer', 'service', 'service.provider'],
    });

    let dispatched = 0;

    for (const appointment of candidates) {
      const when = this.composeDateTime(
        appointment.scheduledDate,
        appointment.scheduledTime,
      );
      if (!when) continue;

      if (when < windowStart || when > windowEnd) continue;

      await this.messaging.publish(MuralEvents.APPOINTMENT_REMINDER, {
        appointmentId: appointment.id,
        serviceId: appointment.serviceId,
        serviceName: appointment.service?.name ?? '',
        customerId: appointment.customerId,
        customerName:
          appointment.customer?.displayName ??
          appointment.customer?.email ??
          '',
        providerId: appointment.service?.provider?.id ?? '',
        providerName: appointment.service?.provider?.displayName ?? '',
        scheduledDate: String(appointment.scheduledDate),
        scheduledDay: appointment.scheduledDay ?? '',
        scheduledTime: appointment.scheduledTime ?? '',
      });

      appointment.reminderSentAt = now;
      await this.appointmentsRepo.save(appointment);
      dispatched++;
    }

    if (dispatched > 0) {
      this.logger.log(
        `[reminder-sweep] ${dispatched} lembretes disparados na janela ${windowStart.toISOString()}–${windowEnd.toISOString()}`,
      );
    }
  }

  /**
   * Compõe um Date a partir da scheduledDate (YYYY-MM-DD) e
   * scheduledTime (HH:mm). Retorna null se algum estiver ausente.
   */
  private composeDateTime(
    date: string | Date,
    time: string | undefined,
  ): Date | null {
    if (!date || !time) return null;
    const dateStr =
      typeof date === 'string' ? date : date.toISOString().slice(0, 10);
    const composed = new Date(`${dateStr}T${time}:00`);
    return isNaN(composed.getTime()) ? null : composed;
  }
}
