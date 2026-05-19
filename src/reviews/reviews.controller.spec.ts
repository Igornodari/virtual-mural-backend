import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { Review } from './entities/review.entity';
import { User } from '../users/entities/user.entity';

const mockUser = (): User =>
  ({
    id: 'user-uuid-1',
    email: 'test@example.com',
    displayName: 'João Silva',
  }) as unknown as User;

const mockReview = (): Review =>
  ({
    id: 'review-uuid-1',
    rating: 5,
    comment: 'Ótimo serviço!',
    authorId: 'user-uuid-1',
    serviceId: 'service-uuid-1',
    createdAt: new Date(),
  }) as unknown as Review;

describe('ReviewsController', () => {
  let controller: ReviewsController;
  let reviewsService: jest.Mocked<ReviewsService>;

  beforeEach(async () => {
    const mockReviewsService: Partial<jest.Mocked<ReviewsService>> = {
      create: jest.fn(),
      findByService: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [{ provide: ReviewsService, useValue: mockReviewsService }],
    }).compile();

    controller = module.get<ReviewsController>(ReviewsController);
    reviewsService = module.get(ReviewsService);
  });

  // ── POST /reviews ─────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve delegar a criação ao ReviewsService com dto e usuário', async () => {
      const user = mockUser();
      const dto: CreateReviewDto = { serviceId: 'service-uuid-1', rating: 5 };
      const review = mockReview();

      reviewsService.create.mockResolvedValue(review);

      const result = await controller.create(dto, user);

      expect(reviewsService.create).toHaveBeenCalledWith(dto, user);
      expect(result).toEqual(review);
    });
  });

  // ── GET /reviews/service/:serviceId ──────────────────────────────────────

  describe('findByService', () => {
    it('deve retornar lista de avaliações anônimas do serviço', async () => {
      const serviceId = 'service-uuid-1';
      const anonymousReviews = [
        { id: 'r1', rating: 4, createdAt: new Date() },
        { id: 'r2', rating: 5, createdAt: new Date() },
      ];

      reviewsService.findByService.mockResolvedValue(anonymousReviews as any);

      const result = await controller.findByService(serviceId);

      expect(reviewsService.findByService).toHaveBeenCalledWith(serviceId);
      expect(result).toEqual(anonymousReviews);
    });
  });

  // ── GET /reviews/:id ──────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar uma avaliação pelo ID', async () => {
      const review = mockReview();

      reviewsService.findOne.mockResolvedValue(review);

      const result = await controller.findOne(review.id);

      expect(reviewsService.findOne).toHaveBeenCalledWith(review.id);
      expect(result).toEqual(review);
    });
  });
});
