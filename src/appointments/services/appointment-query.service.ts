import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Appointment } from '../entities/appointment.entity';
import { User } from '../../users/entities/user.entity';
import { AppointmentWithViewerRole } from '../types/appointment.type';

@Injectable()
export class AppointmentQueryService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
  ) {}

  async findByCustomer(customerId: string): Promise<Appointment[]> {
    return this.appointmentsRepo.find({
      where: { customerId },
      relations: ['service', 'service.provider'],
      order: { scheduledDate: 'DESC' },
    });
  }

  async findByProvider(providerId: string): Promise<Appointment[]> {
    return this.appointmentsRepo
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.service', 'service')
      .leftJoinAndSelect('service.provider', 'provider')
      .leftJoinAndSelect('appointment.customer', 'customer')
      .where('service.providerId = :providerId', { providerId })
      .orderBy('appointment.scheduledDate', 'DESC')
      .getMany();
  }

  async findByServiceRaw(serviceId: string): Promise<Appointment[]> {
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

  async findOneForUser(id: string, requesterId: string): Promise<Appointment> {
    const appointment = await this.findOne(id);

    const isCustomer = appointment.customerId === requesterId;
    const isProvider = appointment.service?.provider?.id === requesterId;

    if (!isCustomer && !isProvider) {
      throw new ForbiddenException('Acesso negado a este agendamento.');
    }

    return appointment;
  }

  async findMine(user: User): Promise<AppointmentWithViewerRole[]> {
    if (!user.condominiumId) {
      throw new ForbiddenException('Usuário sem vínculo com condomínio.');
    }

    const tagged = new Map<string, AppointmentWithViewerRole>();

    for (const appointment of await this.findByCustomer(user.id)) {
      tagged.set(
        appointment.id,
        Object.assign(appointment, { viewerRole: 'customer' as const }),
      );
    }

    for (const appointment of await this.findByProvider(user.id)) {
      if (appointment.customerId === user.id) {
        continue;
      }

      tagged.set(
        appointment.id,
        Object.assign(appointment, { viewerRole: 'provider' as const }),
      );
    }

    return Array.from(tagged.values()).sort((a, b) => {
      const aTime = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
      const bTime = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;

      return bTime - aTime;
    });
  }
}
