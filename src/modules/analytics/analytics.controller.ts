import { Controller, Get, Query, Res, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { interval, map, Observable } from 'rxjs';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsExportService } from './services/analytics-export.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import {
  AnalyticsOverviewResponse,
  AnalyticsPerformanceResponse,
  AnalyticsCostResponse,
  AnalyticsConversationsResponse,
} from './dto/analytics-response.dto';

/**
 * Phase 6 Plans 01 + 02b + 03: Analytics REST endpoints (DASH-05, DASH-01, DASH-02).
 *
 * Plan 01: GET /events
 * Plan 02b: GET /overview, /performance, /cost, /conversations
 * Plan 03: GET /export, GET /stream (SSE)
 *
 * All endpoints require OPERATOR role (T-06-01, T-06-06, T-06-08) to prevent unauthenticated access
 * to analytics data containing chatId/userId and business metrics.
 */
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsEventsService,
    private readonly exportService: AnalyticsExportService,
  ) {}

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
   * Export analytics events as CSV or JSON download.
   *
   * @param query - Query params (startDate, endDate, format)
   * @param res - Express response for setting headers
   */
  @Get('export')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Export analytics events' })
  @ApiResponse({ status: 200, description: 'CSV or JSON export' })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async exportEvents(@Query() query: AnalyticsQueryDto, @Res() res: Response): Promise<void> {
    const startDate = query.startDate ? new Date(query.startDate) : this.getDefaultStartDate();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const format = (query.format as 'csv' | 'json') || 'csv';

    const data = await this.exportService.exportEvents(startDate, endDate, format);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="analytics-export.csv"');
      res.send(data);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.json(data);
    }
  }

  /**
   * SSE stream for real-time KPI updates.
   *
   * Emits KPI snapshots every 10 seconds for dashboard consumption.
   *
   * @returns Observable of KPI snapshot events
   */
  @Sse('stream')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Real-time KPI stream (SSE)' })
  @ApiResponse({ status: 200, description: 'Server-Sent Events stream' })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  stream(): Observable<MessageEvent> {
    // Emit KPI snapshot every 10 seconds
    return interval(10000).pipe(
      map(async () => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setUTCHours(startDate.getUTCHours() - 24); // Rolling 24h window

        const snapshot = await this.analyticsService.getOverview(startDate, endDate);
        return { data: snapshot } as MessageEvent;
      }),
      // Unwrap the Promise
      map((promise) => promise as any),
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
