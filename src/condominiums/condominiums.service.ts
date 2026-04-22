import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Condominium } from './entities/condominium.entity';
import { CreateCondominiumDto } from './dto/create-condominium.dto';
import { UpdateCondominiumDto } from './dto/update-condominium.dto';

@Injectable()
export class CondominiumsService {
  constructor(
    @InjectRepository(Condominium)
    private readonly condominiumsRepo: Repository<Condominium>,
  ) {}

  async create(dto: CreateCondominiumDto): Promise<Condominium> {
    const condominium = this.condominiumsRepo.create(dto);
    return this.condominiumsRepo.save(condominium);
  }

  async findAll(): Promise<Condominium[]> {
    return this.condominiumsRepo.find({ where: { isActive: true } });
  }

  async findOne(id: string): Promise<Condominium> {
    const condominium = await this.condominiumsRepo.findOne({
      where: { id },
      relations: ['users', 'services'],
    });
    if (!condominium) {
      throw new NotFoundException(`Condomínio ${id} não encontrado.`);
    }
    return condominium;
  }

  async findByZipCode(zipCode: string): Promise<Condominium[]> {
    return this.condominiumsRepo.find({
      where: { addressZipCode: zipCode, isActive: true },
    });
  }

  async update(id: string, dto: UpdateCondominiumDto): Promise<Condominium> {
    const condominium = await this.findOne(id);
    Object.assign(condominium, dto);
    return this.condominiumsRepo.save(condominium);
  }

  async remove(id: string): Promise<void> {
    const condominium = await this.findOne(id);
    condominium.isActive = false;
    await this.condominiumsRepo.save(condominium);
  }
}
