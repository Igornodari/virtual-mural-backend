import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { User } from '../users/entities/user.entity';

@ApiTags('appointments')
@ApiBearerAuth('cognito-jwt')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Cria um agendamento (status: pending_payment)',
    description:
      'Cria o agendamento com status pending_payment. ' +
      'O morador deve chamar POST /appointments/:id/pay em seguida para pagar.',
  })
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: User) {
    return this.appointmentsService.create(dto, user);
  }

  @Post(':id/pay')
  @ApiOperation({
    summary: 'Inicia o pagamento de um agendamento via Stripe',
    description:
      'Cria um PaymentIntent no Stripe com split 95/5 e retorna o clientSecret ' +
      'para o frontend confirmar o pagamento com Stripe Elements.',
  })
  initiatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.appointmentsService.initiatePayment(id, user.id);
  }

  @Patch(':id/complete')
  @ApiOperation({
    summary: 'Morador confirma que o serviço foi concluído',
    description:
      'Captura o PaymentIntent (libera o dinheiro ao prestador). ' +
      'Só pode ser chamado pelo morador que fez o agendamento. ' +
      'Não é possível cancelar após esta ação.',
  })
  confirmCompleted(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.appointmentsService.confirmCompleted(id, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Morador cancela o agendamento com reembolso automático',
    description:
      'Cancela o agendamento e emite reembolso total via Stripe. ' +
      'Não é permitido após o serviço ter sido confirmado como concluído.',
  })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.appointmentsService.cancel(id, user.id);
  }

  @Get('available/:serviceId')
  @ApiOperation({
    summary: 'Retorna datas e horários disponíveis de um serviço',
    description:
      'Retorna os próximos dias disponíveis (baseado em availableDays do serviço) ' +
      'com os horários livres (descontando agendamentos já confirmados).',
  })
  @ApiQuery({ name: 'daysAhead', required: false, type: Number, description: 'Número de dias à frente (padrão: 30)' })
  getAvailableDates(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Query('daysAhead') daysAhead?: number,
  ) {
    return this.appointmentsService.getAvailableDates(serviceId, daysAhead ?? 30);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Lista os agendamentos do usuário autenticado' })
  findMine(@CurrentUser() user: User) {
    return this.appointmentsService.findByCustomer(user.id);
  }

  @Get('service/:serviceId')
  @ApiOperation({ summary: 'Lista agendamentos de um serviço (para o prestador)' })
  findByService(@Param('serviceId', ParseUUIDPipe) serviceId: string) {
    return this.appointmentsService.findByService(serviceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retorna um agendamento pelo ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointmentsService.findOne(id);
  }
}
