import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditCrossTenantService } from './audit-cross-tenant.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog], 'main')],
  controllers: [AuditController],
  providers: [AuditService, AuditCrossTenantService],
  exports: [AuditService, AuditCrossTenantService],
})
export class AuditModule {}
