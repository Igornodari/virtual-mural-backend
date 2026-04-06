import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { CreateTimeBlockDto } from './dto/create-time-block.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('schedule')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post('blocks')
  create(@Request() req, @Body() dto: CreateTimeBlockDto) {
    return this.scheduleService.create(req.user.id, dto);
  }

  @Get('blocks')
  findMine(@Request() req, @Query('date') date?: string) {
    return this.scheduleService.findByProvider(req.user.id, date);
  }

  @Get('blocks/provider/:providerId')
  findByProvider(@Param('providerId') providerId: string, @Query('date') date?: string) {
    return this.scheduleService.findByProvider(providerId, date);
  }

  @Delete('blocks/:id')
  remove(@Request() req, @Param('id') id: string) {
    return this.scheduleService.remove(req.user.id, id);
  }
}
