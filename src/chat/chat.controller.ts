import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateChatMessageDto) {
    return this.chatService.create(req.user.id, dto);
  }

  @Get(':appointmentId')
  findByAppointment(@Request() req, @Param('appointmentId') appointmentId: string) {
    return this.chatService.findByAppointment(req.user.id, appointmentId);
  }
}
