import { Injectable } from '@nestjs/common';

import { Appointment } from '../entities/appointment.entity';
import { MessagingService } from '../../messaging/messaging.service';
import { MuralEvents } from '../../messaging/events/mural.events';
import { Service } from '../../services/entities/service.entity';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class AppointmentNotificationService {
  constructor(private readonly messagingService: MessagingService) {}

  async publishAppointmentRequested(params: {
    appointment: Appointment;
    customer: User;
    service: Service | null;
  }): Promise<void> {
    const { appointment, customer, service } = params;

    await this.messagingService.publish(MuralEvents.APPOINTMENT_REQUESTED, {
      appointmentId: appointment.id,
      serviceId: appointment.serviceId,
      serviceName: service?.name ?? '',
      customerId: customer.id,
      customerName: customer.displayName ?? customer.email,
      customerPhone: customer.phone ?? '',
      providerEmail: service?.provider?.email ?? '',
      providerName:
        service?.provider?.displayName ?? service?.provider?.email ?? '',
      providerPhone: service?.provider?.phone ?? '',
      scheduledDate: String(appointment.scheduledDate),
      scheduledDay: appointment.scheduledDay,
      scheduledTime: appointment.scheduledTime ?? '',
    });
  }

  async publishAppointmentStatusChanged(
    appointment: Appointment,
  ): Promise<void> {
    await this.messagingService.publish(
      MuralEvents.APPOINTMENT_STATUS_CHANGED,
      {
        appointmentId: appointment.id,
        status: appointment.status,
        serviceName: appointment.service?.name ?? '',
        customerEmail: appointment.customer?.email ?? '',
        customerPhone: appointment.customer?.phone ?? '',
        customerName:
          appointment.customer?.displayName ??
          appointment.customer?.email ??
          '',
        providerName: appointment.service?.provider?.displayName ?? '',
        scheduledDate: String(appointment.scheduledDate ?? ''),
        scheduledDay: appointment.scheduledDay ?? '',
        scheduledTime: appointment.scheduledTime ?? '',
      },
    );
  }
}
