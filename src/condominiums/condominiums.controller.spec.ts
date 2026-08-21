import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { CondominiumsController } from './condominiums.controller';
import { CondominiumsService } from './condominiums.service';
import { AdminAuthorizationService } from '../common/authorization/admin-authorization.service';
import { User } from '../users/entities/user.entity';
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
      providers: [
        { provide: CondominiumsService, useValue: svc },
        AdminAuthorizationService,
      ],
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

  // ── Autorização administrativa ────────────────────────────────────────────
  // feature papel-de-administrador

  const morador = (extra: Partial<User> = {}): User =>
    ({
      id: 'user-1',
      condominiumId: 'condo-uuid',
      isPlatformAdmin: false,
      isCondoManager: false,
      ...extra,
    }) as unknown as User;

  it('síndico do próprio condomínio consegue desativar @spec:AC-022', async () => {
    svc.remove.mockResolvedValue(undefined);

    await controller.remove('condo-uuid', morador({ isCondoManager: true }));

    expect(svc.remove).toHaveBeenCalledWith('condo-uuid');
  });

  it('morador comum não desativa condomínio @spec:AC-021', () => {
    expect(() => controller.remove('condo-uuid', morador())).toThrow(
      ForbiddenException,
    );

    expect(svc.remove).not.toHaveBeenCalled();
  });

  it('morador comum não atualiza condomínio @spec:AC-021', () => {
    expect(() =>
      controller.update('condo-uuid', { name: 'Novo nome' }, morador()),
    ).toThrow(ForbiddenException);

    expect(svc.update).not.toHaveBeenCalled();
  });

  it('síndico não administra condomínio alheio @spec:AC-023', () => {
    expect(() =>
      controller.remove('outro-condo', morador({ isCondoManager: true })),
    ).toThrow(ForbiddenException);

    expect(svc.remove).not.toHaveBeenCalled();
  });

  it('administrador da plataforma administra qualquer condomínio @spec:AC-024', async () => {
    svc.update.mockResolvedValue({} as never);

    await controller.update(
      'outro-condo',
      { name: 'Novo nome' },
      morador({ isPlatformAdmin: true, condominiumId: null }),
    );

    expect(svc.update).toHaveBeenCalledWith('outro-condo', {
      name: 'Novo nome',
    });
  });

  it('registra quem criou o condomínio @spec:AC-025', async () => {
    svc.create.mockResolvedValue({} as never);
    const dto = { name: 'Condomínio Novo' } as never;

    await controller.create(dto, morador({ id: 'quem-criou' }));

    expect(svc.create).toHaveBeenCalledWith(dto, 'quem-criou');
  });
});
