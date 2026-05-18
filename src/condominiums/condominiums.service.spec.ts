import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CondominiumsService } from './condominiums.service';
import { Condominium } from './entities/condominium.entity';

const mockCondominium = (): Condominium =>
  ({
    id: 'condo-uuid-1',
    name: 'Condomínio Teste',
    addressZipCode: '01310-100',
    addressStreet: 'Avenida Paulista',
    addressNumber: '1000',
    addressComplement: 'Apto 42',
    addressNeighborhood: 'Bela Vista',
    addressCity: 'São Paulo',
    addressState: 'SP',
    latitude: -23.5505,
    longitude: -46.6333,
    isActive: true,
    users: [],
    services: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as unknown as Condominium;

type MockRepo<T> = Partial<Record<keyof Repository<T>, jest.Mock>>;
const createMockRepo = <T>(): MockRepo<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('CondominiumsService', () => {
  let service: CondominiumsService;
  let repo: MockRepo<Condominium>;

  beforeEach(async () => {
    repo = createMockRepo<Condominium>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CondominiumsService,
        { provide: getRepositoryToken(Condominium), useValue: repo },
      ],
    }).compile();

    service = module.get<CondominiumsService>(CondominiumsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('deve criar e salvar um novo condomínio', async () => {
      const condo = mockCondominium();
      repo.create!.mockReturnValue(condo);
      repo.save!.mockResolvedValue(condo);

      const dto = {
        name: 'Condomínio Teste',
        addressZipCode: '01310-100',
        addressStreet: 'Avenida Paulista',
        addressNumber: '1000',
        addressNeighborhood: 'Bela Vista',
        addressCity: 'São Paulo',
        addressState: 'SP',
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await service.create(dto as any);

      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalledWith(condo);
      expect(result).toBe(condo);
    });
  });

  describe('findAll', () => {
    it('deve retornar apenas condomínios ativos', async () => {
      const condos = [mockCondominium()];
      repo.find!.mockResolvedValue(condos);

      const result = await service.findAll();

      expect(repo.find).toHaveBeenCalledWith({ where: { isActive: true } });
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('deve retornar o condomínio com relations', async () => {
      const condo = mockCondominium();
      repo.findOne!.mockResolvedValue(condo);

      const result = await service.findOne(condo.id);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: condo.id },
        relations: ['users', 'services'],
      });
      expect(result).toBe(condo);
    });

    it('deve lançar NotFoundException quando não encontrado', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByZipCode', () => {
    it('deve filtrar condomínios ativos pelo CEP', async () => {
      const condo = mockCondominium();
      repo.find!.mockResolvedValue([condo]);

      const result = await service.findByZipCode('01310-100');

      expect(repo.find).toHaveBeenCalledWith({
        where: { addressZipCode: '01310-100', isActive: true },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('deve atualizar e salvar o condomínio', async () => {
      const condo = mockCondominium();
      repo.findOne!.mockResolvedValue(condo);
      repo.save!.mockImplementation((c: Condominium) => c);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await service.update(condo.id, {
        name: 'Novo Nome',
      } as any);

      expect(result.name).toBe('Novo Nome');
    });

    it('deve lançar NotFoundException quando não encontrado', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        service.update('inexistente', { name: 'Teste' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deve fazer soft delete setando isActive=false', async () => {
      const condo = mockCondominium();
      repo.findOne!.mockResolvedValue(condo);
      repo.save!.mockImplementation((c: Condominium) => c);

      await service.remove(condo.id);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('deve lançar NotFoundException quando não encontrado', async () => {
      repo.findOne!.mockResolvedValue(null);

      await expect(service.remove('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
