import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { User } from '../users/entities/user.entity';
import { MessagingService } from '../messaging/messaging.service';
import { MuralEvents } from '../messaging/events/mural.events';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    private readonly messagingService: MessagingService,
  ) {}

  async create(dto: CreateServiceDto, provider: User): Promise<Service> {
    const condominiumId = dto.condominiumId ?? provider.condominiumId;
    if (!condominiumId) {
      throw new ForbiddenException(
        'O usuário não está vinculado a nenhum condomínio.',
      );
    }

    const service = this.servicesRepo.create({
      ...dto,
      providerId: provider.id,
      condominiumId,
    });

    const saved = await this.servicesRepo.save(service);

    // Publica evento no RabbitMQ para notificar moradores do condomínio
    await this.messagingService.publish(MuralEvents.SERVICE_CREATED, {
      serviceId: saved.id,
      serviceName: saved.name,
      providerName: provider.displayName ?? provider.email,
      condominiumId: saved.condominiumId,
    });

    return saved;
  }

  async findByCondominium(condominiumId: string): Promise<Service[]> {
    return this.servicesRepo.find({
      where: { condominiumId, isActive: true },
      relations: ['provider'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByProvider(providerId: string): Promise<Service[]> {
    return this.servicesRepo.find({
      where: { providerId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.servicesRepo.findOne({
      where: { id },
      relations: ['provider', 'condominium', 'reviews', 'reviews.author'],
    });
    if (!service) throw new NotFoundException(`Serviço ${id} não encontrado.`);
    return service;
  }

  async update(
    id: string,
    dto: UpdateServiceDto,
    requesterId: string,
  ): Promise<Service> {
    const service = await this.findOne(id);
    if (service.providerId !== requesterId) {
      throw new ForbiddenException(
        'Apenas o prestador responsável pode editar este serviço.',
      );
    }
    Object.assign(service, dto);
    return this.servicesRepo.save(service);
  }

  async remove(id: string, requesterId: string): Promise<void> {
    const service = await this.findOne(id);
    if (service.providerId !== requesterId) {
      throw new ForbiddenException(
        'Apenas o prestador responsável pode remover este serviço.',
      );
    }
    service.isActive = false;
    await this.servicesRepo.save(service);
  }

  /**
   * Incrementa um contador de métrica de engajamento.
   * Pode ser chamado por qualquer usuário autenticado (cliente ou prestador).
   * O registro é feito automaticamente pelo uso do cliente — sem restrição de owner.
   */
  async trackMetric(
    id: string,
    metric: 'clicks' | 'interests' | 'completions' | 'abandonments',
  ): Promise<void> {
    const service = await this.servicesRepo.findOne({ where: { id } });
    if (!service) throw new NotFoundException(`Serviço ${id} não encontrado.`);
    service[metric] = (service[metric] ?? 0) + 1;
    await this.servicesRepo.save(service);
  }

  /**
   * Recalcula a média de avaliações do serviço.
   * Chamado pelo ReviewsService após cada nova avaliação.
   */
  async recalcRating(serviceId: string): Promise<void> {
    const service = await this.servicesRepo.findOne({
      where: { id: serviceId },
      relations: ['reviews'],
    });
    if (!service) return;

    const reviews = service.reviews ?? [];
    const total = reviews.length;
    const avg =
      total > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / total
        : 0;

    service.rating = Math.round(avg * 100) / 100;
    service.totalReviews = total;
    await this.servicesRepo.save(service);
  }
}
