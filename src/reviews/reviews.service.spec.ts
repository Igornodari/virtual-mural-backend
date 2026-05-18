import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ReviewsService } from './reviews.service';
import { Review } from './entities/review.entity';
import { ServicesService } from '../services/services.service';
import { MessagingService } from '../messaging/messaging.service';
import { User } from '../users/entities/user.entity';
import { Service } from '../services/entities/service.entity';

const mockReview = (): Review =>
  ({
    id: 'review-uuid-1',
    rating: 5,
    comment: 'Excelente serviço!',
    authorId: 'user-uuid',
    serviceId: 'service-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Review;

const mockAuthor = (): User =>
  ({
    id: 'user-uuid',
    displayName: 'João Silva',
    email: 'joao@example.com',
  }) as unknown as User;

const mockSvc = (): Service =>
  ({
    id: 'service-uuid',
    name: 'Pintura',
    provider: { email: 'prestador@example.com', displayName: 'Ana' },
  }) as unknown as Service;

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;
const createMockRepo = <T>(): MockRepo<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('ReviewsService', () => {
  let service: ReviewsService;
  let repo: MockRepo<Review>;
  let servicesService: { recalcRating: jest.Mock; findOne: jest.Mock };
  let messagingService: { publish: jest.Mock };

  beforeEach(async () => {
    repo = createMockRepo<Review>();
    servicesService = {
      recalcRating: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(mockSvc()),
    };
    messagingService = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getRepositoryToken(Review), useValue: repo },
        { provide: ServicesService, useValue: servicesService },
        { provide: MessagingService, useValue: messagingService },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar e salvar uma avaliação', async () => {
      const review = mockReview();
      repo.findOne!.mockResolvedValue(null); // sem avaliação duplicada
      repo.create!.mockReturnValue(review);
      repo.save!.mockResolvedValue(review);

      const dto = { serviceId: 'service-uuid', rating: 5, comment: 'Ótimo!' };
      const result = await service.create(dto, mockAuthor());

      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        authorId: 'user-uuid',
      });
      expect(repo.save).toHaveBeenCalledWith(review);
      expect(servicesService.recalcRating).toHaveBeenCalledWith('service-uuid');
      expect(messagingService.publish).toHaveBeenCalled();
      expect(result).toBe(review);
    });

    it('deve lançar ConflictException se usuário já avaliou o serviço', async () => {
      repo.findOne!.mockResolvedValue(mockReview()); // já existe

      const dto = { serviceId: 'service-uuid', rating: 4 };
      await expect(service.create(dto, mockAuthor())).rejects.toThrow(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // ── findByService ─────────────────────────────────────────────────────────

  describe('findByService', () => {
    it('deve retornar avaliações anônimas em ordem decrescente', async () => {
      repo.find!.mockResolvedValue([mockReview()]);

      const result = await service.findByService('service-uuid');

      expect(repo.find).toHaveBeenCalledWith({
        where: { serviceId: 'service-uuid' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
      // Resultado deve ser anônimo — sem dados pessoais do autor
      expect(result[0]).not.toHaveProperty('author');
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar a avaliação com relations', async () => {
      const review = mockReview();
      repo.findOne!.mockResolvedValue(review);

      const result = await service.findOne(review.id);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: review.id },
        relations: ['author', 'service'],
      });
      expect(result).toBe(review);
    });

    it('deve lançar NotFoundException quando não encontrada', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
