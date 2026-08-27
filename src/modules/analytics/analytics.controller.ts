import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import {
  AnalyticsOverviewResponse,
  AnalyticsPerformanceResponse,
  AnalyticsCostResponse,
  AnalyticsConversationsResponse,
} from './dto/analytics-response.dto';

/**
 * Phase 6 Plans 01 + 02b: Analytics REST endpoints (DASH-05, DASH-01, DASH-02).
 *
 * Plan 01: GET /events
 * Plan 02b: GET /overview, /performance, /cost, /conversations
 *
 * All endpoints require OPERATOR role (T-06-01, T-06-06) to prevent unauthenticated access
 * to analytics data containing chatId/userId and business metrics.
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

  /**
   * Get overview KPIs and charts.
   *
   * @param query - Query params (startDate, endDate, sessionId)
   * @returns Overview KPIs + time-series charts
   */
  @Get('overview')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get analytics overview' })
  @ApiResponse({ status: 200, description: 'Overview KPIs and charts' })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getOverview(@Query() query: AnalyticsQueryDto): Promise<AnalyticsOverviewResponse> {
    const startDate = query.startDate ? new Date(query.startDate) : this.getDefaultStartDate();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    return this.analyticsService.getOverview(startDate, endDate, query.sessionId);
  }

  /**
   * Get performance metrics (latency percentiles).
   *
   * @param query - Query params (startDate, endDate, granularity)
   * @returns Latency percentiles time-series
   */
  @Get('performance')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get performance metrics' })
  @ApiResponse({ status: 200, description: 'Latency percentiles' })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getPerformance(@Query() query: AnalyticsQueryDto): Promise<AnalyticsPerformanceResponse> {
    const startDate = query.startDate ? new Date(query.startDate) : this.getDefaultStartDate();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    return this.analyticsService.getPerformance(startDate, endDate, query.granularity);
  }

  /**
   * Get cost breakdown.
   *
   * @param query - Query params (startDate, endDate, groupBy)
   * @returns Total cost + breakdown by provider/session
   */
  @Get('cost')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get cost breakdown' })
  @ApiResponse({ status: 200, description: 'Cost breakdown' })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getCost(@Query() query: AnalyticsQueryDto): Promise<AnalyticsCostResponse> {
    const startDate = query.startDate ? new Date(query.startDate) : this.getDefaultStartDate();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    return this.analyticsService.getCost(startDate, endDate, query.sessionId ? 'session' : 'provider');
  }

  /**
   * Get paginated conversations.
   *
   * @param query - Query params (startDate, endDate, sessionId, page, limit)
   * @returns Paginated conversations list
   */
  @Get('conversations')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get conversations list' })
  @ApiResponse({ status: 200, description: 'Paginated conversations' })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getConversations(@Query() query: AnalyticsQueryDto): Promise<AnalyticsConversationsResponse> {
    const startDate = query.startDate ? new Date(query.startDate) : this.getDefaultStartDate();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    return this.analyticsService.getConversations(
      startDate,
      endDate,
      query.sessionId,
      query.page,
      query.limit || 20,
    );
  }

  /**
   * Default start date: 30 days ago.
   */
  private getDefaultStartDate(): Date {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 30);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
