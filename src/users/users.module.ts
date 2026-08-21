import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { AdminAuthorizationService } from '../common/authorization/admin-authorization.service';
import { UsersController } from './users.controller';
import { Service } from '../services/entities/service.entity';
import { Appointment } from '../appointments/entities/appointment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Service, Appointment])],
  controllers: [UsersController],
  providers: [UsersService, AdminAuthorizationService],
  exports: [UsersService],
})
export class UsersModule {}
