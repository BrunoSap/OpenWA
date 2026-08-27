import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { OnboardingService, OnboardingStep } from './onboarding.service';
import { OnboardingStateDto } from './dto/onboarding-state.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

/**
 * AdvanceStepDto - Request body for advancing onboarding step
 */
class AdvanceStepDto {
  step!: OnboardingStep;
}

/**
 * OnboardingController - Manages tenant onboarding wizard state
 * Phase 09 Plan 04: Tenant onboarding automation
 *
 * All routes require ADMIN role API key
 */
@ApiTags('onboarding')
@Controller('api/onboarding')
@RequireRole(ApiKeyRole.ADMIN)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get(':tenantId/state')
  @ApiOperation({ summary: 'Get current onboarding state for tenant' })
  @ApiResponse({ status: 200, description: 'Onboarding state retrieved', type: OnboardingStateDto })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getState(@Param('tenantId') tenantId: string): Promise<OnboardingStateDto> {
    return this.onboardingService.getState(tenantId);
  }

  @Post(':tenantId/advance')
  @ApiOperation({ summary: 'Advance to next onboarding step' })
  @ApiResponse({ status: 200, description: 'Step advanced successfully', type: OnboardingStateDto })
  @ApiResponse({ status: 400, description: 'Step validation failed or step mismatch' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async advanceStep(
    @Param('tenantId') tenantId: string,
    @Body() dto: AdvanceStepDto,
  ): Promise<OnboardingStateDto> {
    return this.onboardingService.advanceStep(tenantId, dto.step);
  }
}
