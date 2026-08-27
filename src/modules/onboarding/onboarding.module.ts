import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingState } from './entities/onboarding-state.entity';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { TenantModule } from '../tenant/tenant.module';
import { SessionModule } from '../session/session.module';

/**
 * OnboardingModule - Tenant onboarding wizard state management
 * Phase 09 Plan 04: Tenant onboarding automation
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OnboardingState], 'main'),
    TenantModule,
    SessionModule,
  ],
  providers: [OnboardingService],
  controllers: [OnboardingController],
  exports: [OnboardingService],
})
export class OnboardingModule {}
