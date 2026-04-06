import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeBlock } from './entities/time-block.entity';
import { CreateTimeBlockDto } from './dto/create-time-block.dto';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(TimeBlock)
    private readonly timeBlockRepo: Repository<TimeBlock>,
  ) {}

  async create(userId: string, dto: CreateTimeBlockDto) {
    const block = this.timeBlockRepo.create({
      ...dto,
      providerId: userId,
    });
    return this.timeBlockRepo.save(block);
  }

  async findByProvider(providerId: string, date?: string) {
    const query = this.timeBlockRepo.createQueryBuilder('block')
      .where('block.providerId = :providerId', { providerId });

    if (date) {
      query.andWhere('block.date = :date', { date });
    }

    return query.orderBy('block.startTime', 'ASC').getMany();
  }

  async remove(userId: string, id: string) {
    const block = await this.timeBlockRepo.findOne({ where: { id } });
    if (!block) return;

    if (block.providerId !== userId) {
      throw new ForbiddenException('Você não tem permissão para remover este bloqueio');
    }

    await this.timeBlockRepo.remove(block);
  }
}
