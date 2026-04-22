import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { CreateAppointmentPaymentDto } from './dto/create-appointment-payment.dto';
import { User } from '../users/entities/user.entity';

@ApiTags('appointments')
@ApiBearerAuth('cognito-jwt')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Solicita um agendamento de serviço' })
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: User) {
    return this.appointmentsService.create(dto, user);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Lista os agendamentos do usuário autenticado' })
  findMine(@CurrentUser() user: User) {
    return this.appointmentsService.findMine(user);
  }

  @Get('service/:serviceId')
  @ApiOperation({
    summary:
      'Lista agendamentos de um serviço (para o prestador ou disponibilidade)',
  })
  findByService(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @CurrentUser() user: User,
  ) {
    return this.appointmentsService.findByService(serviceId, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retorna um agendamento pelo ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Post(':id/payment')
  @ApiOperation({ summary: 'Inicia fluxo de pagamento do agendamento' })
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAppointmentPaymentDto,
    @CurrentUser() user: User,
  ) {
    return this.appointmentsService.payAppointment(id, dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualiza o status de um agendamento' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppointmentStatusDto,
    @CurrentUser() user: User,
  ) {
    return this.appointmentsService.updateStatus(id, dto, user.id);
  }

  @Post('verify-payment')
  @ApiOperation({
    summary:
      'Verifica uma Checkout Session Stripe e atualiza o agendamento se pago',
  })
  verifyPayment(
    @Body('checkoutSessionId') checkoutSessionId: string,
    @CurrentUser() user: User,
  ) {
    return this.appointmentsService.verifyPaymentSession(
      checkoutSessionId,
      user.id,
    );
  }
}
