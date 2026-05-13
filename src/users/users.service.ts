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

/**
 * Status considerados "abertos" para fins de bloqueio da desativação do
 * modo prestador. Se houver QUALQUER agendamento nesses status no serviço
 * do usuário, ele não pode desativar.
 */
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
      // Bloqueia a desativação se houver serviço ativo ou agendamento
      // em aberto. Evita o cenário em que o prestador "some" no meio de
      // uma operação ativa (cliente continuaria com o agendamento mas
      // sem dono do serviço acessível).
      if (dto.isProvider === false && user.isProvider === true) {
        await this.assertCanDeactivateProvider(userId);
      }
      user.isProvider = dto.isProvider;
    }

    // Onboarding agora considera apenas o vínculo com condomínio. Ser
    // prestador é opt-in pós-onboarding e não trava o acesso ao app.
    user.onboardingCompleted = user.addressCompleted;
    return this.usersRepo.save(user);
  }

  async findAllByCondominium(condominiumId: string): Promise<User[]> {
    return this.usersRepo.find({ where: { condominiumId } });
  }

  /**
   * Lança se o usuário não puder desativar o modo prestador.
   * Critérios:
   *  - Nenhum serviço ativo (isActive=true).
   *  - Nenhum agendamento nos status "abertos" em qualquer dos seus serviços.
   */
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
}
