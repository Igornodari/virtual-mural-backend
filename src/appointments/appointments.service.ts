import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from './entities/appointment.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { User } from '../users/entities/user.entity';
import { Service } from '../services/entities/service.entity';
import { MessagingService } from '../messaging/messaging.service';
import { MuralEvents } from '../messaging/events/mural.events';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    private readonly messagingService: MessagingService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Cria um agendamento com status pending_payment.
   * O agendamento só é confirmado após o pagamento via Stripe.
   */
  async create(dto: CreateAppointmentDto, customer: User): Promise<Appointment> {
    const service = await this.servicesRepo.findOne({
      where: { id: dto.serviceId },
      relations: ['provider'],
    });

    if (!service) {
      throw new NotFoundException(`Serviço ${dto.serviceId} não encontrado.`);
    }

    // Verifica se o dia solicitado está disponível
    if (dto.scheduledDay && !service.availableDays.includes(dto.scheduledDay)) {
      throw new BadRequestException(
        `O dia "${dto.scheduledDay}" não está disponível para este serviço.`,
      );
    }

    // Verifica se o horário solicitado está disponível
    if (dto.scheduledSlot && service.availableSlots?.length) {
      if (!service.availableSlots.includes(dto.scheduledSlot)) {
        throw new BadRequestException(
          `O horário "${dto.scheduledSlot}" não está disponível para este serviço.`,
        );
      }
    }

    const appointment = this.appointmentsRepo.create({
      ...dto,
      customerId: customer.id,
      status: 'pending_payment',
    });

    const saved = await this.appointmentsRepo.save(appointment);

    // Notifica o prestador via RabbitMQ
    await this.messagingService.publish(MuralEvents.APPOINTMENT_REQUESTED, {
      appointmentId: saved.id,
      serviceId: saved.serviceId,
      serviceName: service.name,
      customerId: customer.id,
      customerName: customer.displayName ?? customer.email,
      providerEmail: service.provider?.email ?? '',
      providerName: service.provider?.displayName ?? service.provider?.email ?? '',
      scheduledDate: saved.scheduledDate,
      scheduledDay: saved.scheduledDay,
      scheduledSlot: saved.scheduledSlot,
    });

    return saved;
  }

  /**
   * Inicia o pagamento de um agendamento.
   * Retorna o clientSecret do Stripe para o frontend confirmar o pagamento.
   */
  async initiatePayment(
    appointmentId: string,
    requesterId: string,
  ): Promise<{ clientSecret: string; amountInCents: number }> {
    return this.paymentsService.createPaymentIntentForAppointment(
      appointmentId,
      requesterId,
    );
  }

  /**
   * Confirma a conclusão do serviço pelo morador.
   * Libera o pagamento ao prestador (captura o PaymentIntent).
   */
  async confirmCompleted(
    appointmentId: string,
    requesterId: string,
  ): Promise<Appointment> {
    const appointment = await this.paymentsService.confirmServiceCompleted(
      appointmentId,
      requesterId,
    );

    // Notifica via RabbitMQ
    await this.messagingService.publish(MuralEvents.APPOINTMENT_STATUS_CHANGED, {
      appointmentId,
      status: 'completed',
      serviceName: appointment.service?.name ?? '',
      customerEmail: '',
      customerName: '',
      providerName: '',
    });

    return appointment;
  }

  /**
   * Cancela um agendamento e emite reembolso automático.
   * Só é permitido antes da confirmação de conclusão.
   */
  async cancel(appointmentId: string, requesterId: string): Promise<Appointment> {
    const appointment = await this.paymentsService.cancelAppointment(
      appointmentId,
      requesterId,
    );

    await this.messagingService.publish(MuralEvents.APPOINTMENT_STATUS_CHANGED, {
      appointmentId,
      status: 'cancelled',
      serviceName: appointment.service?.name ?? '',
      customerEmail: '',
      customerName: '',
      providerName: '',
    });

    return appointment;
  }

  /**
   * Retorna os dias disponíveis de um serviço para os próximos N dias.
   * Exclui dias que já têm agendamentos confirmados no mesmo slot.
   */
  async getAvailableDates(
    serviceId: string,
    daysAhead = 30,
  ): Promise<Array<{ date: string; day: string; slots: string[] }>> {
    const service = await this.servicesRepo.findOne({ where: { id: serviceId } });
    if (!service) throw new NotFoundException(`Serviço ${serviceId} não encontrado.`);

    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const result: Array<{ date: string; day: string; slots: string[] }> = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dayName = dayNames[date.getDay()];

      if (service.availableDays.includes(dayName)) {
        const dateStr = date.toISOString().split('T')[0];

        // Busca agendamentos já existentes neste dia para calcular slots ocupados
        const existingAppointments = await this.appointmentsRepo.find({
          where: {
            serviceId,
            scheduledDate: date as any,
          },
        });

        const occupiedSlots = existingAppointments
          .filter((a) => ['confirmed', 'in_progress'].includes(a.status))
          .map((a) => a.scheduledSlot)
          .filter(Boolean);

        const availableSlots = (service.availableSlots ?? []).filter(
          (slot) => !occupiedSlots.includes(slot),
        );

        result.push({ date: dateStr, day: dayName, slots: availableSlots });
      }
    }

    return result;
  }

  async findByCustomer(customerId: string): Promise<Appointment[]> {
    return this.appointmentsRepo.find({
      where: { customerId },
      relations: ['service', 'service.provider'],
      order: { scheduledDate: 'DESC' },
    });
  }

  async findByService(serviceId: string): Promise<Appointment[]> {
    return this.appointmentsRepo.find({
      where: { serviceId },
      relations: ['customer'],
      order: { scheduledDate: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Appointment> {
    const appointment = await this.appointmentsRepo.findOne({
      where: { id },
      relations: ['service', 'service.provider', 'customer'],
    });
    if (!appointment) {
      throw new NotFoundException(`Agendamento ${id} não encontrado.`);
    }
    return appointment;
  }
}
