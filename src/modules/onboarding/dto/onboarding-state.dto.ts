import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * OnboardingStateDto - Onboarding wizard state response
 * Phase 09 Plan 04: Tenant onboarding automation
 */
export class OnboardingStateDto {
  @ApiProperty({ description: 'Current wizard step', enum: ['welcome', 'whatsapp', 'test-message', 'complete'] })
  currentStep!: string;

  @ApiProperty({ description: 'Array of completed step IDs', type: [String] })
  completedSteps!: string[];

  @ApiPropertyOptional({ description: 'Additional state metadata' })
  metadata?: Record<string, any>;
}
