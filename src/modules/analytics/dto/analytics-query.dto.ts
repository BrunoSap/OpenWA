import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Phase 6 Plan 01: Analytics query DTO for GET /api/analytics/events.
 *
 * Validates and coerces the limit query param with class-validator decorators.
 * Service-level clamping to max 100 is redundant but defensive (T-06-03).
 */
export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of events to return (clamped to 100)',
    minimum: 1,
    maximum: 100,
    default: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
