import { IsOptional, IsDateString, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Phase 10 Plan 01: Query DTO for intent analytics endpoints.
 *
 * Supports time-range filtering for GET /api/analytics/intents.
 */
export class IntentQueryDto {
  @ApiPropertyOptional({
    description: 'Start date for intent analytics (ISO 8601)',
    example: '2026-08-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for intent analytics (ISO 8601)',
    example: '2026-08-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by session ID',
    example: 'default',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
