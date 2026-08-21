import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminAuthorizationService } from '../common/authorization/admin-authorization.service';
import { User } from '../users/entities/user.entity';
import { CondominiumsService } from './condominiums.service';
import { CreateCondominiumDto } from './dto/create-condominium.dto';
import { UpdateCondominiumDto } from './dto/update-condominium.dto';

@ApiTags('condominiums')
@ApiBearerAuth('cognito-jwt')
@UseGuards(JwtAuthGuard)
@Controller('condominiums')
export class CondominiumsController {
  constructor(
    private readonly condominiumsService: CondominiumsService,
    private readonly adminAuth: AdminAuthorizationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo condomínio' })
  create(@Body() dto: CreateCondominiumDto, @CurrentUser() user: User) {
    // Aberto a morador autenticado — o onboarding depende disso. O autor
    // passa a ficar registrado para permitir a curadoria da base depois.
    return this.condominiumsService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos os condomínios ativos' })
  @ApiQuery({ name: 'zipCode', required: false, description: 'Filtra por CEP' })
  findAll(@Query('zipCode') zipCode?: string) {
    if (zipCode) return this.condominiumsService.findByZipCode(zipCode);
    return this.condominiumsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retorna um condomínio pelo ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.condominiumsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualiza dados de um condomínio (síndico ou administrador)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCondominiumDto,
    @CurrentUser() user: User,
  ) {
    this.adminAuth.assertPodeAdministrarCondominio(user, id);
    return this.condominiumsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Desativa um condomínio (síndico ou administrador)',
  })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    this.adminAuth.assertPodeAdministrarCondominio(user, id);
    return this.condominiumsService.remove(id);
  }
}
