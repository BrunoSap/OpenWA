import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsEvent } from './entities/analytics-event.entity';

/**
 * Phase 6 Plan 01: Analytics REST endpoints (DASH-05).
 *
 * Exposes analytics events for dashboard/n8n consumption. All endpoints require OPERATOR role
 * (T-06-01) to prevent unauthenticated access to event data containing chatId/userId.
 */
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsEventsService) {}

  /**
   * Get recent analytics events.
   *
   * @param query - Query params (limit)
   * @returns Array of recent events, newest first
   *
   * @remarks
   * - Limit clamped to max 100 (service-level enforcement)
   * - Requires OPERATOR api-key (T-06-01)
   */
  @Get('events')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get recent analytics events' })
  @ApiResponse({ status: 200, description: 'Recent analytics events', type: [AnalyticsEvent] })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getEvents(@Query() query: AnalyticsQueryDto): Promise<AnalyticsEvent[]> {
    return this.analyticsService.listRecent(query.limit);
  }
}
