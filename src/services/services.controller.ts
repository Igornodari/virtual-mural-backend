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
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { User } from '../users/entities/user.entity';

@ApiTags('services')
@ApiBearerAuth('cognito-jwt')
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo serviço (apenas prestadores)' })
  create(@Body() dto: CreateServiceDto, @CurrentUser() user: User) {
    return this.servicesService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Lista serviços do condomínio ou do prestador autenticado' })
  @ApiQuery({ name: 'condominiumId', required: false })
  @ApiQuery({ name: 'mine', required: false, type: Boolean })
  findAll(
    @CurrentUser() user: User,
    @Query('condominiumId') condominiumId?: string,
    @Query('mine') mine?: boolean,
  ) {
    if (mine) return this.servicesService.findByProvider(user.id);
    const cid = condominiumId ?? user.condominiumId ?? '';
    return this.servicesService.findByCondominium(cid);
  }

  /** Deve vir ANTES de :id para não ser interceptado como UUID */
  @Get('analytics/me')
  @ApiOperation({ summary: 'Retorna analytics de todos os serviços do prestador autenticado' })
  getProviderAnalytics(@CurrentUser() user: User) {
    return this.servicesService.getProviderAnalytics(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retorna detalhes de um serviço com avaliações' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.servicesService.findOne(id);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Retorna analytics de um serviço específico (apenas o prestador dono)' })
  getAnalytics(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.servicesService.getAnalytics(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um serviço (apenas o prestador dono)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() user: User,
  ) {
    return this.servicesService.update(id, dto, user.id);
  }

  @Patch(':id/track/:metric')
  @ApiOperation({ summary: 'Registra um evento de métrica (clicks, interests, completions, abandonments)' })
  trackMetric(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('metric') metric: 'clicks' | 'interests' | 'completions' | 'abandonments',
    @CurrentUser() user: User,
  ) {
    return this.servicesService.trackMetric(id, metric, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove um serviço (soft delete, apenas o prestador dono)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.servicesService.remove(id, user.id);
  }
}
