import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './entities/review.entity';
import { Appointment } from '../appointments/entities/appointment.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { User } from '../users/entities/user.entity';
import { ServicesService } from '../services/services.service';
import { MessagingService } from '../messaging/messaging.service';
import { MuralEvents } from '../messaging/events/mural.events';

/** Formato anônimo retornado ao listar avaliações de um serviço */
export interface AnonymousReview {
  id: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepo: Repository<Review>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    private readonly servicesService: ServicesService,
    private readonly messagingService: MessagingService,
  ) {}

  async create(dto: CreateReviewDto, author: User): Promise<Review> {
    // A nota só significa alguma coisa se vier de quem contratou. Sem esta
    // trava, qualquer usuário inflava a própria reputação e afundava a do
    // concorrente sem nunca ter contratado nada.
    const atendimentoConcluido = await this.appointmentsRepo.count({
      where: {
        serviceId: dto.serviceId,
        customerId: author.id,
        status: 'completed',
      },
    });
    if (atendimentoConcluido === 0) {
      throw new ForbiddenException(
        'Conclua um atendimento deste serviço antes de avaliá-lo.',
      );
    }

    // Impede avaliações duplicadas do mesmo usuário para o mesmo serviço
    const existing = await this.reviewsRepo.findOne({
      where: { serviceId: dto.serviceId, authorId: author.id },
    });
    if (existing) {
      throw new ConflictException('Você já avaliou este serviço.');
    }

    const review = this.reviewsRepo.create({
      ...dto,
      authorId: author.id,
    });
    const saved = await this.reviewsRepo.save(review);

    await this.servicesService.recalcRating(dto.serviceId);
    const service = await this.servicesService.findOne(dto.serviceId);

    await this.messagingService.publish(MuralEvents.REVIEW_SUBMITTED, {
      reviewId: saved.id,
      serviceId: saved.serviceId,
      serviceName: service?.name ?? '',
      authorId: author.id,
      authorName: author.displayName ?? author.email,
      providerEmail: service?.provider?.email ?? '',
      providerName:
        service?.provider?.displayName ?? service?.provider?.email ?? '',
      rating: saved.rating,
    });

    return saved;
  }

  /**
   * Lista avaliações de um serviço de forma ANÔNIMA.
   * Nenhum dado de identificação do autor é retornado.
   */
  async findByService(serviceId: string): Promise<AnonymousReview[]> {
    const reviews = await this.reviewsRepo.find({
      where: { serviceId },
      order: { createdAt: 'DESC' },
      // Não carrega a relação 'author' intencionalmente — anonimização
    });
    return reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment ?? undefined,
      createdAt: r.createdAt,
    }));
  }

  async findOne(id: string): Promise<Review> {
    const review = await this.reviewsRepo.findOne({
      where: { id },
      relations: ['author', 'service'],
    });
    if (!review) throw new NotFoundException(`Avaliação ${id} não encontrada.`);
    return review;
  }
}
