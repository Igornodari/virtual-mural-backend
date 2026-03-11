import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface CognitoUserData {
  cognitoSub: string;
  email: string;
  givenName?: string;
  familyName?: string;
  displayName?: string;
  avatarUrl?: string;
  cognitoUsername?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  /**
   * Cria ou atualiza o usuário com base no sub do Cognito.
   * Chamado automaticamente pela estratégia JWT a cada request autenticado.
   */
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
        displayName: data.displayName ?? `${data.givenName ?? ''} ${data.familyName ?? ''}`.trim(),
        avatarUrl: data.avatarUrl,
        cognitoUsername: data.cognitoUsername,
        authProvider: data.cognitoUsername?.includes('Google') ? 'google' : 'cognito',
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

  /**
   * Salva o condomínio e/ou o perfil (role) do usuário durante o onboarding.
   */
  async updateOnboarding(
    userId: string,
    dto: UpdateOnboardingDto,
  ): Promise<User> {
    const user = await this.findById(userId);

    if (dto.condominiumId !== undefined) {
      user.condominiumId = dto.condominiumId;
      user.addressCompleted = true;
    }

    if (dto.roleInCondominium !== undefined) {
      user.roleInCondominium = dto.roleInCondominium;
      user.roleCompleted = true;
    }

    user.onboardingCompleted = user.addressCompleted && user.roleCompleted;
    return this.usersRepo.save(user);
  }

  async findAllByCondominium(condominiumId: string): Promise<User[]> {
    return this.usersRepo.find({ where: { condominiumId } });
  }
}
