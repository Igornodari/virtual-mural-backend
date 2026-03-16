import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from './entities/appointment.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { User } from '../users/entities/user.entity';
import { Service } from '../services/entities/service.entity';
import { MessagingService } from '../messaging/messaging.service';
import { MuralEvents } from '../messaging/events/mural.events';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    private readonly messagingService: MessagingService,
  ) {}

  async create(
    dto: CreateAppointmentDto,
    customer: User,
  ): Promise<Appointment> {
    const appointment = this.appointmentsRepo.create({
      ...dto,
      customerId: customer.id,
    });

    const saved = await this.appointmentsRepo.save(appointment);

    // Carrega o serviço com o prestador para enriquecer o evento RabbitMQ
    const service = await this.servicesRepo.findOne({
      where: { id: dto.serviceId },
      relations: ['provider'],
    });

    // Notifica o prestador via RabbitMQ com todos os dados necessários para o SES
    await this.messagingService.publish(MuralEvents.APPOINTMENT_REQUESTED, {
      appointmentId: saved.id,
      serviceId: saved.serviceId,
      serviceName: service?.name ?? '',
      customerId: customer.id,
      customerName: customer.displayName ?? customer.email,
      providerEmail: service?.provider?.email ?? '',
      providerName: service?.provider?.displayName ?? service?.provider?.email ?? '',
      scheduledDate: saved.scheduledDate,
      scheduledDay: saved.scheduledDay,
    });

    return saved;
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

  async updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
    requesterId: string,
  ): Promise<Appointment> {
    const appointment = await this.findOne(id);

    const isCustomer = appointment.customerId === requesterId;
    const isProvider = appointment.service?.provider?.id === requesterId;

    if (!isCustomer && !isProvider) {
      throw new ForbiddenException(
        'Apenas o cliente ou o prestador podem alterar o status deste agendamento.',
      );
    }

    appointment.status = dto.status;
    const saved = await this.appointmentsRepo.save(appointment);

    // Notifica o morador sobre a mudança de status via RabbitMQ
    await this.messagingService.publish(MuralEvents.APPOINTMENT_STATUS_CHANGED, {
      appointmentId: saved.id,
      status: saved.status,
      serviceName: appointment.service?.name ?? '',
      customerEmail: appointment.customer?.email ?? '',
      customerName: appointment.customer?.displayName ?? appointment.customer?.email ?? '',
      providerName: appointment.service?.provider?.displayName ?? '',
    });

    return saved;
  }
}
