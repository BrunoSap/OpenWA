import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Module for multi-tenant management
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant], 'main'),
    forwardRef(() => AuthModule),
  ],
  providers: [TenantService],
  controllers: [TenantController],
  exports: [TenantService],
})
export class TenantModule {}
