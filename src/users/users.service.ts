import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Service } from '../services/entities/service.entity';
import { Appointment } from '../appointments/entities/appointment.entity';

export interface CognitoUserData {
  cognitoSub: string;
  email: string;
  givenName?: string;
  familyName?: string;
  displayName?: string;
  avatarUrl?: string;
  cognitoUsername?: string;
}

export interface UserExportData {
  id: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  authProvider: string;
  isProvider: boolean;
  onboardingCompleted: boolean;
  condominiumId: string | null;
  createdAt: Date;
  updatedAt: Date;
  exportedAt: string;
  services: Array<{ id: string; name: string; category: string; createdAt: Date }>;
  appointments: Array<{ id: string; status: string; scheduledDate: Date; createdAt: Date }>;
  totalReviews: number;
}

const OPEN_APPOINTMENT_STATUSES = [
  'pending',
  'confirmed',
  'awaiting_payment',
  'paid',
] as const;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
  ) {}

  async findOrCreateByCognito(data: CognitoUserData): Promise<User> {
    let user = await this.usersRepo.findOne({
      where: { cognitoSub: data.cognitoSub },
      relations: ['condominium'],
    });

    if (!user) {
      user = this.usersRepo.create({
        cognitoSub: data.cognitoSub,
        email: data.email,
        givenName: data.givenName,
        familyName: data.familyName,
        displayName:
          data.displayName ??
          `${data.givenName ?? ''} ${data.familyName ?? ''}`.trim(),
        avatarUrl: data.avatarUrl,
        cognitoUsername: data.cognitoUsername,
        authProvider: data.cognitoUsername?.includes('Google')
          ? 'google'
          : 'cognito',
      });
    }

    user.lastLoginAt = new Date();
    return this.usersRepo.save(user);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['condominium'],
    });
    if (!user) throw new NotFoundException(`Usuário ${id} não encontrado.`);
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findById(userId);
    Object.assign(user, dto);
    return this.usersRepo.save(user);
  }

  async updateOnboarding(
    userId: string,
    dto: UpdateOnboardingDto,
  ): Promise<User> {
    const user = await this.findById(userId);

    if (dto.condominiumId !== undefined) {
      user.condominiumId = dto.condominiumId;
      user.addressCompleted = true;
    }

    if (dto.isProvider !== undefined) {
      if (dto.isProvider === false && user.isProvider === true) {
        await this.assertCanDeactivateProvider(userId);
      }
      user.isProvider = dto.isProvider;
    }

    user.onboardingCompleted = user.addressCompleted;
    return this.usersRepo.save(user);
  }

  async findAllByCondominium(condominiumId: string): Promise<User[]> {
    return this.usersRepo.find({ where: { condominiumId } });
  }

  async assertCanDeactivateProvider(userId: string): Promise<void> {
    const activeServiceCount = await this.servicesRepo.count({
      where: { providerId: userId, isActive: true },
    });
    if (activeServiceCount > 0) {
      throw new BadRequestException(
        `Você ainda tem ${activeServiceCount} serviço(s) ativo(s). ` +
          'Remova-os antes de desativar o modo prestador.',
      );
    }

    const openAppointmentCount = await this.appointmentsRepo
      .createQueryBuilder('appointment')
      .innerJoin('appointment.service', 'service')
      .where('service.providerId = :userId', { userId })
      .andWhere('appointment.status IN (:...statuses)', {
        statuses: OPEN_APPOINTMENT_STATUSES,
      })
      .getCount();

    if (openAppointmentCount > 0) {
      throw new BadRequestException(
        `Você ainda tem ${openAppointmentCount} agendamento(s) em aberto. ` +
          'Conclua ou cancele antes de desativar o modo prestador.',
      );
    }
  }

  /**
   * LGPD — Direito ao esquecimento (Art. 18, IV da Lei 13.709/2018)
   * Anonimiza todos os dados pessoais do usuário sem remover o registro,
   * preservando a integridade referencial do banco (agendamentos, reviews).
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.findById(userId);

    // Verificar se pode desativar prestador (se for prestador)
    if (user.isProvider) {
      await this.assertCanDeactivateProvider(userId);
    }

    // Anonimização: substituir dados pessoais por valores neutros
    const anonymizedAt = new Date().toISOString();
    user.email = `deleted_${user.id}@anonymous.virtual-mural.com`;
    user.givenName = 'Usuário';
    user.familyName = 'Removido';
    user.displayName = 'Usuário Removido';
    user.phone = null;
    user.avatarUrl = null;
    user.cognitoSub = `deleted_${user.id}_${anonymizedAt}`;
    user.cognitoUsername = null;
    user.stripeAccountId = null;
    user.stripeAccountStatus = null;
    user.isProvider = false;
    user.onboardingCompleted = false;

    await this.usersRepo.save(user);
  }

  /**
   * LGPD — Direito de acesso (Art. 18, I da Lei 13.709/2018)
   * Retorna todos os dados pessoais do usuário em formato exportável.
   */
  async exportData(userId: string): Promise<UserExportData> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      relations: ['services', 'appointments'],
    });

    if (!user) throw new NotFoundException(`Usuário ${userId} não encontrado.`);

    return {
      id: user.id,
      email: user.email,
      givenName: user.givenName ?? null,
      familyName: user.familyName ?? null,
      displayName: user.displayName ?? null,
      phone: user.phone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      authProvider: user.authProvider,
      isProvider: user.isProvider,
      onboardingCompleted: user.onboardingCompleted,
      condominiumId: user.condominiumId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      exportedAt: new Date().toISOString(),
      services: (user.services ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        createdAt: s.createdAt,
      })),
      appointments: (user.appointments ?? []).map((a) => ({
        id: a.id,
        status: a.status,
        scheduledDate: a.scheduledDate,
        createdAt: a.createdAt,
      })),
      totalReviews: user.reviews?.length ?? 0,
    };
  }
}
