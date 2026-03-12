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

export interface ServiceAnalytics {
  serviceId: string;
  serviceName: string;
  clicks: number;
  interests: number;
  completions: number;
  abandonments: number;
  rating: number;
  totalReviews: number;
  /** Distribuição de estrelas: { 1: n, 2: n, 3: n, 4: n, 5: n } */
  ratingDistribution: Record<number, number>;
  /** Últimos comentários anônimos */
  recentComments: Array<{ rating: number; comment: string; createdAt: Date }>;
}

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

  /**
   * Incrementa um contador de métrica de engajamento.
   * Chamado pelo controller quando o frontend registra um evento.
   */
  async trackMetric(
    id: string,
    metric: 'clicks' | 'interests' | 'completions' | 'abandonments',
    requesterId: string,
  ): Promise<void> {
    const service = await this.servicesRepo.findOne({ where: { id } });
    if (!service) throw new NotFoundException(`Serviço ${id} não encontrado.`);
    if (service.providerId !== requesterId) {
      throw new ForbiddenException(
        'Apenas o prestador responsável pode registrar métricas.',
      );
    }
    service[metric] = (service[metric] ?? 0) + 1;
    await this.servicesRepo.save(service);
  }

  /**
   * Retorna os dados analíticos completos de um serviço.
   * Comentários são retornados de forma anônima (sem nome do autor).
   */
  async getAnalytics(id: string, requesterId: string): Promise<ServiceAnalytics> {
    const service = await this.servicesRepo.findOne({
      where: { id },
      relations: ['reviews'],
    });
    if (!service) throw new NotFoundException(`Serviço ${id} não encontrado.`);
    if (service.providerId !== requesterId) {
      throw new ForbiddenException(
        'Apenas o prestador responsável pode visualizar os analytics.',
      );
    }

    const reviews = service.reviews ?? [];

    // Distribuição de estrelas
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) {
      ratingDistribution[r.rating] = (ratingDistribution[r.rating] ?? 0) + 1;
    }

    // Últimos 10 comentários anônimos (sem authorId, sem nome)
    const recentComments = reviews
      .filter((r) => r.comment && r.comment.trim().length > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map((r) => ({
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
      }));

    return {
      serviceId: service.id,
      serviceName: service.name,
      clicks: service.clicks ?? 0,
      interests: service.interests ?? 0,
      completions: service.completions ?? 0,
      abandonments: service.abandonments ?? 0,
      rating: Number(service.rating),
      totalReviews: service.totalReviews,
      ratingDistribution,
      recentComments,
    };
  }

  /**
   * Retorna analytics de todos os serviços de um prestador.
   */
  async getProviderAnalytics(providerId: string): Promise<ServiceAnalytics[]> {
    const services = await this.servicesRepo.find({
      where: { providerId, isActive: true },
      relations: ['reviews'],
      order: { createdAt: 'DESC' },
    });

    return services.map((service) => {
      const reviews = service.reviews ?? [];
      const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const r of reviews) {
        ratingDistribution[r.rating] = (ratingDistribution[r.rating] ?? 0) + 1;
      }
      const recentComments = reviews
        .filter((r) => r.comment && r.comment.trim().length > 0)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10)
        .map((r) => ({ rating: r.rating, comment: r.comment, createdAt: r.createdAt }));

      return {
        serviceId: service.id,
        serviceName: service.name,
        clicks: service.clicks ?? 0,
        interests: service.interests ?? 0,
        completions: service.completions ?? 0,
        abandonments: service.abandonments ?? 0,
        rating: Number(service.rating),
        totalReviews: service.totalReviews,
        ratingDistribution,
        recentComments,
      };
    });
  }
}
