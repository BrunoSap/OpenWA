import { IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Phase 10 Plan 03 Task 3: Query DTO for satisfaction analytics endpoint.
 *
 * Supports date range filtering for NPS/CSAT aggregations.
 */
export class SatisfactionQueryDto {
  @ApiPropertyOptional({
    description: 'Start date for satisfaction data (ISO 8601)',
    example: '2026-08-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for satisfaction data (ISO 8601)',
    example: '2026-08-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
