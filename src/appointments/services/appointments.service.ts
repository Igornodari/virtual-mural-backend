import { Injectable } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';
import { CreateAppointmentPaymentDto } from '../dto/create-appointment-payment.dto';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from '../dto/update-appointment-status.dto';
import { Appointment } from '../entities/appointment.entity';
import { AppointmentAvailabilityService } from './appointment-availability.service';
import { AppointmentCreationService } from './appointment-creation.service';
import { AppointmentPaymentService } from './appointment-payment.service';
import { AppointmentQueryService } from './appointment-query.service';
import { AppointmentStatusService } from './appointment-status.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly creationService: AppointmentCreationService,
    private readonly queryService: AppointmentQueryService,
    private readonly availabilityService: AppointmentAvailabilityService,
    private readonly statusService: AppointmentStatusService,
    private readonly paymentService: AppointmentPaymentService,
  ) {}

  create(dto: CreateAppointmentDto, user: User): Promise<Appointment> {
    return this.creationService.create(dto, user);
  }

  async findMine(user: User) {
    await this.paymentService.syncPendingPaymentsForCustomer(user.id);
    await this.paymentService.syncPendingPaymentsForProvider(user.id);

    return this.queryService.findMine(user);
  }

  findByService(serviceId: string, user: User) {
    return this.availabilityService.findByService(serviceId, user);
  }

  findOneForUser(id: string, requesterId: string) {
    return this.queryService.findOneForUser(id, requesterId);
  }

  updateStatus(
    id: string,
    dto: UpdateAppointmentStatusDto,
    requesterId: string,
  ) {
    return this.statusService.updateStatus(id, dto, requesterId);
  }

  cancelByCustomer(id: string, requesterId: string) {
    return this.statusService.cancelByCustomer(id, requesterId);
  }

  payAppointment(id: string, dto: CreateAppointmentPaymentDto, customer: User) {
    return this.paymentService.payAppointment(id, dto, customer);
  }

  verifyPaymentSession(checkoutSessionId: string, requesterId: string) {
    return this.paymentService.verifyPaymentSession(
      checkoutSessionId,
      requesterId,
    );
  }

  handleStripeCheckoutSessionCompleted(params: {
    appointmentId: string;
    sessionId: string;
  }) {
    return this.paymentService.handleStripeCheckoutSessionCompleted(params);
  }

  handleStripeCheckoutSessionExpired(params: {
    appointmentId: string;
    sessionId: string;
  }) {
    return this.paymentService.handleStripeCheckoutSessionExpired(params);
  }

  handleStripePaymentSucceeded(externalPaymentId: string) {
    return this.paymentService.handleStripePaymentSucceeded(externalPaymentId);
  }

  handleStripePaymentFailed(externalPaymentId: string) {
    return this.paymentService.handleStripePaymentFailed(externalPaymentId);
  }
}
