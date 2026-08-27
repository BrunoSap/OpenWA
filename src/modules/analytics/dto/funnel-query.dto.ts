import { IsOptional, IsDateString, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Phase 10 Plan 02 Task 3: Query parameters for funnel analytics endpoint (DASH-04).
 */
export class FunnelQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  variantId?: string;
}
