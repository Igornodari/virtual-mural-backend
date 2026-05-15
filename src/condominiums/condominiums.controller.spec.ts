import { Test, TestingModule } from '@nestjs/testing';
import { CondominiumsController } from './condominiums.controller';
import { CondominiumsService } from './condominiums.service';
import { Condominium } from './entities/condominium.entity';

const mockCondo = (): Condominium =>
  ({
    id: 'condo-uuid',
    name: 'Residencial São Paulo',
    addressZipCode: '01310-100',
    isActive: true,
  }) as unknown as Condominium;

describe('CondominiumsController', () => {
  let controller: CondominiumsController;
  let svc: {
    create: jest.Mock;
    findAll: jest.Mock;
    findByZipCode: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    svc = {
      create: jest.fn(),
      findAll: jest.fn(),
      findByZipCode: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CondominiumsController],
      providers: [{ provide: CondominiumsService, useValue: svc }],
    }).compile();

    controller = module.get<CondominiumsController>(CondominiumsController);
  });

  it('findAll deve chamar findAll sem filtro', async () => {
    svc.findAll.mockResolvedValue([mockCondo()]);
    const result = await controller.findAll();
    expect(svc.findAll).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it('findAll deve chamar findByZipCode quando zipCode fornecido', async () => {
    svc.findByZipCode.mockResolvedValue([mockCondo()]);
    const result = await controller.findAll('01310-100');
    expect(svc.findByZipCode).toHaveBeenCalledWith('01310-100');
    expect(result).toHaveLength(1);
  });

  it('remove deve chamar condominiumsService.remove', async () => {
    svc.remove.mockResolvedValue(undefined);
    await controller.remove('condo-uuid');
    expect(svc.remove).toHaveBeenCalledWith('condo-uuid');
  });
});
