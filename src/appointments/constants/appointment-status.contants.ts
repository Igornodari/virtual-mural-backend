import { AppointmentStatus } from '../entities/appointment.entity';

export const BLOCKING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'confirmed',
  'awaiting_payment',
  'paid',
];

export const CUSTOMER_CANCELLABLE_STATUSES: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'awaiting_payment',
];

export const VALID_APPOINTMENT_TRANSITIONS: Record<
  AppointmentStatus,
  AppointmentStatus[]
> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  awaiting_payment: [],
  paid: ['completed'],
  cancelled: [],
  completed: [],
};
