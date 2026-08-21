import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Condominium } from './entities/condominium.entity';
import { CondominiumsService } from './condominiums.service';
import { AdminAuthorizationService } from '../common/authorization/admin-authorization.service';
import { CondominiumsController } from './condominiums.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Condominium])],
  controllers: [CondominiumsController],
  providers: [CondominiumsService, AdminAuthorizationService],
  exports: [CondominiumsService],
})
export class CondominiumsModule {}
