import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StripeConnectService } from './stripe-connect.service';
import { StripeConnectController } from './stripe-connect.controller';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [StripeConnectController],
  providers: [StripeConnectService],
  exports: [StripeConnectService],
})
export class StripeConnectModule {}
