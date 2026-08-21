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
  ratingDistribution: Record<number, number>;
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
    // Apenas usuários que ativaram o modo prestador podem publicar serviços.
    // Moradores comuns precisam clicar em "Virar prestador" no perfil antes.
    if (!provider.isProvider) {
      throw new ForbiddenException(
        'Ative o modo prestador no seu perfil antes de publicar serviços.',
      );
    }

    if (!provider.condominiumId) {
      throw new ForbiddenException(
        'O usuário não está vinculado a nenhum condomínio.',
      );
    }

    // O condomínio vem SEMPRE do vínculo do prestador. Aceitar o valor do
    // corpo da requisição permitia publicar serviço em condomínio alheio.
    if (
      dto.condominiumId !== undefined &&
      dto.condominiumId !== provider.condominiumId
    ) {
      throw new ForbiddenException(
        'Você só pode publicar serviços no seu próprio condomínio.',
      );
    }

    const condominiumId = provider.condominiumId;

    // availableDays é derivado dos slots (prioridade) ou enviado diretamente
    const availableDays = dto.availabilitySlots?.length
      ? dto.availabilitySlots.map((s) => s.day)
      : (dto.availableDays ?? []);

    if (!availableDays.length) {
      throw new ForbiddenException(
        'Configure ao menos um dia de disponibilidade (availableDays ou availabilitySlots).',
      );
    }

    const service = this.servicesRepo.create({
      ...dto,
      availableDays,
      providerId: provider.id,
      condominiumId,
      // Explícito mesmo com default no Postgres — testes de integração e
      // qualquer consumidor que leia o objeto antes do INSERT ver true.
      isActive: true,
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

  /**
   * Fronteira do condomínio. O mural é do prédio: um morador do condomínio A
   * não lê nem escreve nada do condomínio B.
   *
   * Usuário sem vínculo é negado, e recurso sem condomínio também — a ausência
   * do dado nunca deve significar liberação.
   */
  private assertSameCondominium(
    userCondominiumId: string | null | undefined,
    resourceCondominiumId: string | null | undefined,
    mensagem: string,
  ): void {
    if (!userCondominiumId || !resourceCondominiumId) {
      throw new ForbiddenException(mensagem);
    }
    if (userCondominiumId !== resourceCondominiumId) {
      throw new ForbiddenException(mensagem);
    }
  }

  /**
   * Listagem escopada ao condomínio do usuário. Se vier um condomínio
   * explícito diferente do dele, recusa em vez de ignorar em silêncio —
   * parâmetro ignorado esconde tentativa de acesso indevido.
   */
  async findByCondominiumForUser(
    user: User,
    requestedCondominiumId?: string,
  ): Promise<Service[]> {
    if (!user.condominiumId) {
      throw new ForbiddenException(
        'Vincule-se a um condomínio para ver os serviços do mural.',
      );
    }

    if (
      requestedCondominiumId !== undefined &&
      requestedCondominiumId !== user.condominiumId
    ) {
      throw new ForbiddenException(
        'Você só tem acesso aos serviços do seu próprio condomínio.',
      );
    }

    return this.findByCondominium(user.condominiumId);
  }

  /**
   * Detalhe do serviço escopado ao condomínio do usuário.
   *
   * A checagem NÃO fica no findOne cru de propósito: ele é reaproveitado
   * internamente por update, remove e pelo módulo de avaliações, onde a
   * fronteira é aplicada por outro caminho.
   */
  async findOneForUser(id: string, user: User): Promise<Service> {
    const service = await this.findOne(id);

    this.assertSameCondominium(
      user.condominiumId,
      service.condominiumId,
      'Este serviço não está disponível no seu condomínio.',
    );

    return service;
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
    // Se availabilitySlots fornecido no update, sincroniza availableDays
    if (dto.availabilitySlots?.length) {
      dto.availableDays = dto.availabilitySlots.map((s) => s.day);
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
   * Retorna analytics de um serviço específico.
   * Apenas o prestador responsável pode acessar.
   */
  async getAnalytics(
    id: string,
    requesterId: string,
  ): Promise<ServiceAnalytics> {
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
    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    reviews.forEach((r) => {
      ratingDistribution[r.rating] = (ratingDistribution[r.rating] ?? 0) + 1;
    });
    const recentComments = reviews
      .filter((r) => r.comment)
      .slice(0, 10)
      .map((r) => ({
        rating: r.rating,
        comment: r.comment ?? '',
        createdAt: r.createdAt,
      }));
    return {
      serviceId: service.id,
      serviceName: service.name,
      clicks: service.clicks ?? 0,
      interests: service.interests ?? 0,
      completions: service.completions ?? 0,
      abandonments: service.abandonments ?? 0,
      rating: service.rating ?? 0,
      totalReviews: service.totalReviews ?? 0,
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
    });
    return services.map((service) => {
      const reviews = service.reviews ?? [];
      const ratingDistribution: Record<number, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };
      reviews.forEach((r) => {
        ratingDistribution[r.rating] = (ratingDistribution[r.rating] ?? 0) + 1;
      });
      const recentComments = reviews
        .filter((r) => r.comment)
        .slice(0, 5)
        .map((r) => ({
          rating: r.rating,
          comment: r.comment ?? '',
          createdAt: r.createdAt,
        }));
      return {
        serviceId: service.id,
        serviceName: service.name,
        clicks: service.clicks ?? 0,
        interests: service.interests ?? 0,
        completions: service.completions ?? 0,
        abandonments: service.abandonments ?? 0,
        rating: service.rating ?? 0,
        totalReviews: service.totalReviews ?? 0,
        ratingDistribution,
        recentComments,
      };
    });
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
      total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0;

    service.rating = Math.round(avg * 100) / 100;
    service.totalReviews = total;
    await this.servicesRepo.save(service);
  }
}
