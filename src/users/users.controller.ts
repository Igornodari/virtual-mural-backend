import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('users')
@ApiBearerAuth('cognito-jwt')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Retorna o perfil completo do usuário autenticado' })
  getMe(@CurrentUser() user: User) {
    return user;
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Atualiza nome, telefone e avatar do usuário' })
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Patch('me/onboarding')
  @ApiOperation({
    summary: 'Salva o condomínio e/ou o opt-in de prestador',
    description:
      'Endpoint chamado pelo frontend para vincular o usuário a um ' +
      'condomínio durante o onboarding, ou para ativar/desativar o ' +
      'modo prestador a qualquer momento.',
  })
  updateOnboarding(
    @CurrentUser() user: User,
    @Body() dto: UpdateOnboardingDto,
  ) {
    return this.usersService.updateOnboarding(user.id, dto);
  }
}
