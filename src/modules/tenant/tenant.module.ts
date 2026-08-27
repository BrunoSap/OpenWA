import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './tenant.entity';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantController } from './tenant.controller';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';

/**
 * Module for multi-tenant management
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant], 'main'),
    forwardRef(() => AuthModule),
    BillingModule,
  ],
  providers: [TenantService, TenantProvisioningService],
  controllers: [TenantController],
  exports: [TenantService, TenantProvisioningService],
})
export class TenantModule {}
