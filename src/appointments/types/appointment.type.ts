import { Appointment } from '../entities/appointment.entity';

export type ViewerRole = 'customer' | 'provider';

export type AppointmentWithViewerRole = Appointment & {
  viewerRole: ViewerRole;
};

export type BlockedSlot = {
  date: string;
  time: string | null;
};

export type AppointmentBlockedSlotRow = {
  scheduledDate: string | Date;
  scheduledTime: string | null;
};

export type AvailabilitySlotLike = {
  day?: string;
  startTime?: string;
  endTime?: string;
};

export type ServiceAvailabilityResponse = {
  serviceId: string;
  timeSlots: string[];
  blockedDates: string[];
  blockedSlots: BlockedSlot[];
};
