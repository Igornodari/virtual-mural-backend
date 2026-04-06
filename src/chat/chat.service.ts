import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepo: Repository<ChatMessage>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
  ) {}

  async create(userId: string, dto: CreateChatMessageDto) {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: dto.appointmentId },
      relations: ['service'],
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Verifica se o usuário é o cliente ou o prestador do serviço
    const isCustomer = appointment.customerId === userId;
    const isProvider = appointment.service.providerId === userId;

    if (!isCustomer && !isProvider) {
      throw new ForbiddenException('Você não tem permissão para enviar mensagens neste chat');
    }

    const message = this.chatRepo.create({
      content: dto.content,
      appointmentId: dto.appointmentId,
      senderId: userId,
    });

    return this.chatRepo.save(message);
  }

  async findByAppointment(userId: string, appointmentId: string) {
    const appointment = await this.appointmentRepo.findOne({
      where: { id: appointmentId },
      relations: ['service'],
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    const isCustomer = appointment.customerId === userId;
    const isProvider = appointment.service.providerId === userId;

    if (!isCustomer && !isProvider) {
      throw new ForbiddenException('Você não tem permissão para visualizar este chat');
    }

    return this.chatRepo.find({
      where: { appointmentId },
      order: { createdAt: 'ASC' },
    });
  }
}
