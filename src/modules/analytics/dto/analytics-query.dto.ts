import { IsOptional, IsInt, Min, Max, IsDateString, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Phase 6 Plans 01 + 02b: Analytics query DTO for analytics endpoints.
 *
 * Plan 01: limit param for GET /api/analytics/events
 * Plan 02b: startDate, endDate, sessionId, granularity, page, limit for KPI endpoints
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

  @ApiPropertyOptional({
    description: 'Start date (ISO 8601)',
    example: '2026-08-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date (ISO 8601)',
    example: '2026-08-27T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by session ID',
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'Aggregation granularity',
    enum: ['hour', 'day', 'week'],
    default: 'day',
  })
  @IsOptional()
  @IsEnum(['hour', 'day', 'week'])
  granularity?: 'hour' | 'day' | 'week';

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
}
