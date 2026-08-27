import { ApiProperty } from '@nestjs/swagger';
import { Tenant } from '../tenant.entity';

/**
 * ProvisioningResultDto - Response from tenant provisioning
 * Phase 09 Plan 04: Tenant onboarding
 *
 * CRITICAL: adminKey is shown ONCE in this response and never retrievable again
 */
export class ProvisioningResultDto {
  @ApiProperty({ description: 'Created tenant entity' })
  tenant!: Tenant;

  @ApiProperty({ description: 'Admin API key (raw, unhashed) - SHOW ONCE, never retrievable' })
  adminKey!: string;

  @ApiProperty({ description: 'Onboarding wizard setup URL' })
  setupUrl!: string;
}
