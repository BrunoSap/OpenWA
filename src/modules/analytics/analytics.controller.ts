import { Controller, Get, Post, Delete, Query, Param, Body, Res, Sse } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { interval, map, Observable } from 'rxjs';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsExportService } from './services/analytics-export.service';
import { AnalyticsAlertService } from './services/analytics-alert.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsAlertRule } from './entities/analytics-alert-rule.entity';
import {
  AnalyticsOverviewResponse,
  AnalyticsPerformanceResponse,
  AnalyticsCostResponse,
  AnalyticsConversationsResponse,
} from './dto/analytics-response.dto';
import { IntentQueryDto } from './dto/intent-query.dto';
import { IntentResponseDto } from './dto/intent-response.dto';
import { IntentTaxonomyDto } from './dto/intent-taxonomy.dto';
import { FunnelQueryDto } from './dto/funnel-query.dto';
import { FunnelResponseDto } from './dto/funnel-response.dto';
import { ABExperimentDto } from './dto/ab-experiment.dto';
import { SatisfactionQueryDto } from './dto/satisfaction-query.dto';
import { SatisfactionResponseDto } from './dto/satisfaction-response.dto';
import { AnalyticsIntentClassification } from './entities/analytics-intent-classification.entity';
import { AnalyticsIntentTaxonomy } from './entities/analytics-intent-taxonomy.entity';
import { AnalyticsIntentRoutingRule } from './entities/analytics-intent-routing-rule.entity';
import { AnalyticsABExperiment } from './entities/analytics-ab-experiment.entity';
import { AnalyticsSatisfactionResponse } from './entities/analytics-satisfaction-response.entity';
import { FunnelAnalyticsService } from './services/funnel-analytics.service';
import { ABTestingService } from './services/ab-testing.service';
import { SatisfactionSurveyService } from './services/satisfaction-survey.service';
import { PredictiveModelsService } from './services/predictive-models.service';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

/**
 * Phase 6 Plans 01 + 02b + 03: Analytics REST endpoints (DASH-05, DASH-01, DASH-02).
 * Phase 10 Plan 01: Intent classification endpoints (DASH-03).
 * Phase 10 Plan 02: Funnel analytics + A/B experiment CRUD (DASH-04).
 *
 * Plan 01: GET /events
 * Plan 02b: GET /overview, /performance, /cost, /conversations
 * Plan 03: GET /export, GET /stream (SSE), GET|POST|DELETE /alerts/rules
 * Phase 10 Plan 01: GET /intents, GET|POST|DELETE /intents/taxonomy, GET|POST /intents/routing-rules
 * Phase 10 Plan 02: GET /funnel, GET|POST|PUT /experiments
 *
 * All endpoints require OPERATOR role (T-06-01, T-06-06, T-06-08, T-06-10, T-10-03, T-10-05, T-10-07) to prevent unauthenticated access
 * to analytics data containing chatId/userId and business metrics.
 */
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsEventsService,
    private readonly exportService: AnalyticsExportService,
    private readonly funnelAnalyticsService: FunnelAnalyticsService,
    private readonly abTestingService: ABTestingService,
    private readonly satisfactionSurveyService: SatisfactionSurveyService,
    private readonly predictiveModelsService: PredictiveModelsService,
    @InjectRepository(AnalyticsAlertRule, 'data')
    private readonly alertRuleRepository: Repository<AnalyticsAlertRule>,
    @InjectRepository(AnalyticsIntentClassification, 'data')
    private readonly intentClassificationRepository: Repository<AnalyticsIntentClassification>,
    @InjectRepository(AnalyticsIntentTaxonomy, 'data')
    private readonly intentTaxonomyRepository: Repository<AnalyticsIntentTaxonomy>,
    @InjectRepository(AnalyticsIntentRoutingRule, 'data')
    private readonly intentRoutingRuleRepository: Repository<AnalyticsIntentRoutingRule>,
    @InjectRepository(AnalyticsABExperiment, 'data')
    private readonly experimentRepository: Repository<AnalyticsABExperiment>,
    @InjectRepository(AnalyticsSatisfactionResponse, 'data')
    private readonly satisfactionResponseRepository: Repository<AnalyticsSatisfactionResponse>,
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
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
   * Get all alert rules.
   *
   * @returns Array of alert rules
   */
  @Get('alerts/rules')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get alert rules' })
  @ApiResponse({ status: 200, description: 'Alert rules', type: [AnalyticsAlertRule] })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getAlertRules(): Promise<AnalyticsAlertRule[]> {
    return this.alertRuleRepository.find({ order: { created_at: 'DESC' } });
  }

  /**
   * Create a new alert rule.
   *
   * @param body - Alert rule data
   * @returns Created alert rule
   */
  @Post('alerts/rules')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create alert rule' })
  @ApiResponse({ status: 201, description: 'Alert rule created', type: AnalyticsAlertRule })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async createAlertRule(@Body() body: Partial<AnalyticsAlertRule>): Promise<AnalyticsAlertRule> {
    const rule = this.alertRuleRepository.create(body);
    return this.alertRuleRepository.save(rule);
  }

  /**
   * Delete an alert rule.
   *
   * @param id - Rule ID
   */
  @Delete('alerts/rules/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Delete alert rule' })
  @ApiResponse({ status: 200, description: 'Alert rule deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async deleteAlertRule(@Param('id') id: string): Promise<void> {
    await this.alertRuleRepository.delete(id);
  }

  /**
   * Get intent distribution and trends (Phase 10 Plan 01).
   *
   * @param query - Query params (startDate, endDate, sessionId)
   * @returns Intent distribution (topIntents) and trends over time
   */
  @Get('intents')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get intent distribution and trends' })
  @ApiResponse({ status: 200, description: 'Intent analytics', type: IntentResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getIntents(@Query() query: IntentQueryDto): Promise<IntentResponseDto> {
    const startDate = query.startDate ? new Date(query.startDate) : this.getDefaultStartDate();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Build query with optional sessionId filter
    const queryBuilder = this.intentClassificationRepository
      .createQueryBuilder('classification')
      .where('classification.classified_at >= :startDate', { startDate })
      .andWhere('classification.classified_at <= :endDate', { endDate });

    if (query.sessionId) {
      queryBuilder.andWhere('classification.session_id = :sessionId', {
        sessionId: query.sessionId,
      });
    }

    const classifications = await queryBuilder.getMany();

    if (classifications.length === 0) {
      return {
        topIntents: [],
        trendsOverTime: [],
      };
    }

    // Calculate top intents
    const intentCounts = new Map<string, number>();
    classifications.forEach((c) => {
      intentCounts.set(c.intent_name, (intentCounts.get(c.intent_name) || 0) + 1);
    });

    const totalCount = classifications.length;
    const topIntents = Array.from(intentCounts.entries())
      .map(([intent, count]) => ({
        intent,
        count,
        percentage: (count / totalCount) * 100,
      }))
      .sort((a, b) => b.count - a.count);

    // Calculate trends over time (daily aggregation)
    const trendMap = new Map<string, Record<string, number>>();
    classifications.forEach((c) => {
      const date = c.classified_at.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!trendMap.has(date)) {
        trendMap.set(date, {});
      }
      const dayCounts = trendMap.get(date)!;
      dayCounts[c.intent_name] = (dayCounts[c.intent_name] || 0) + 1;
    });

    const trendsOverTime = Array.from(trendMap.entries())
      .map(([date, intentCounts]) => ({
        date,
        intentCounts,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      topIntents,
      trendsOverTime,
    };
  }

  /**
   * Get all intent taxonomies (Phase 10 Plan 01 Task 2).
   *
   * @returns Array of intent taxonomies for the tenant
   */
  @Get('intents/taxonomy')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get intent taxonomies' })
  @ApiResponse({ status: 200, description: 'Intent taxonomies', type: [AnalyticsIntentTaxonomy] })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getIntentTaxonomies(): Promise<AnalyticsIntentTaxonomy[]> {
    // Default to 'global' tenant (Phase 9 multi-tenancy will add tenant context)
    return this.intentTaxonomyRepository.find({
      where: { tenant_id: 'global' },
      order: { intent_name: 'ASC' },
    });
  }

  /**
   * Create a new intent in taxonomy (Phase 10 Plan 01 Task 2).
   *
   * @param body - Intent taxonomy data
   * @returns Created intent taxonomy
   */
  @Post('intents/taxonomy')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create intent in taxonomy' })
  @ApiResponse({ status: 201, description: 'Intent created', type: AnalyticsIntentTaxonomy })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  @ApiResponse({ status: 409, description: 'Intent name already exists for tenant' })
  async createIntentTaxonomy(@Body() body: IntentTaxonomyDto): Promise<AnalyticsIntentTaxonomy> {
    // Check for duplicate (tenant_id, intent_name)
    const existing = await this.intentTaxonomyRepository.findOne({
      where: { tenant_id: 'global', intent_name: body.intent_name },
    });

    if (existing) {
      throw new Error(`Intent '${body.intent_name}' already exists for tenant 'global'`);
    }

    const taxonomy = this.intentTaxonomyRepository.create({
      tenant_id: 'global',
      intent_name: body.intent_name,
      intent_description: body.intent_description,
      examples: body.examples,
    });

    return this.intentTaxonomyRepository.save(taxonomy);
  }

  /**
   * Update an intent in taxonomy (Phase 10 Plan 01 Task 2).
   *
   * @param id - Intent taxonomy ID
   * @param body - Updated intent data
   * @returns Updated intent taxonomy
   */
  @Post('intents/taxonomy/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update intent in taxonomy' })
  @ApiResponse({ status: 200, description: 'Intent updated', type: AnalyticsIntentTaxonomy })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  @ApiResponse({ status: 404, description: 'Intent not found' })
  async updateIntentTaxonomy(
    @Param('id') id: string,
    @Body() body: IntentTaxonomyDto,
  ): Promise<AnalyticsIntentTaxonomy> {
    const taxonomy = await this.intentTaxonomyRepository.findOne({ where: { id: parseInt(id) } });

    if (!taxonomy) {
      throw new Error(`Intent taxonomy with ID ${id} not found`);
    }

    taxonomy.intent_description = body.intent_description;
    taxonomy.examples = body.examples;

    return this.intentTaxonomyRepository.save(taxonomy);
  }

  /**
   * Delete an intent from taxonomy (Phase 10 Plan 01 Task 2).
   *
   * @param id - Intent taxonomy ID
   */
  @Delete('intents/taxonomy/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Delete intent from taxonomy' })
  @ApiResponse({ status: 200, description: 'Intent deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async deleteIntentTaxonomy(@Param('id') id: string): Promise<void> {
    await this.intentTaxonomyRepository.delete(parseInt(id));
  }

  /**
   * Get all intent routing rules (Phase 10 Plan 01 Task 2).
   *
   * @returns Array of routing rules
   */
  @Get('intents/routing-rules')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get intent routing rules' })
  @ApiResponse({
    status: 200,
    description: 'Routing rules',
    type: [AnalyticsIntentRoutingRule],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getIntentRoutingRules(): Promise<AnalyticsIntentRoutingRule[]> {
    return this.intentRoutingRuleRepository.find({ order: { created_at: 'DESC' } });
  }

  /**
   * Create a new intent routing rule (Phase 10 Plan 01 Task 2).
   *
   * @param body - Routing rule data
   * @returns Created routing rule
   */
  @Post('intents/routing-rules')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create intent routing rule' })
  @ApiResponse({ status: 201, description: 'Routing rule created', type: AnalyticsIntentRoutingRule })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async createIntentRoutingRule(
    @Body() body: Partial<AnalyticsIntentRoutingRule>,
  ): Promise<AnalyticsIntentRoutingRule> {
    const rule = this.intentRoutingRuleRepository.create(body);
    return this.intentRoutingRuleRepository.save(rule);
  }

  /**
   * Get funnel analytics with drop-off rates and A/B test comparison (Phase 10 Plan 02 Task 3).
   *
   * @param query - Query params (startDate, endDate, variantId)
   * @returns Funnel conversion stats + variant comparison + recommendations
   */
  @Get('funnel')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get funnel analytics' })
  @ApiResponse({ status: 200, description: 'Funnel analytics with A/B test comparison' })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getFunnelAnalytics(@Query() query: FunnelQueryDto): Promise<FunnelResponseDto> {
    const startDate = query.startDate ? new Date(query.startDate) : this.getDefaultStartDate();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Get overall stats (no variant filter)
    const overallStats = await this.funnelAnalyticsService.computeFunnelStats(startDate, endDate);

    // Convert to OverallConversionDto format
    const stagesMap = new Map(overallStats.map((s) => [s.stage, s.users]));
    const overallConversion = {
      initiated: stagesMap.get('initiated') || 0,
      qualified: stagesMap.get('qualified') || 0,
      data_collected: stagesMap.get('data_collected') || 0,
      exported: stagesMap.get('exported') || 0,
      converted: stagesMap.get('converted') || 0,
      conversionRate:
        stagesMap.get('initiated') && stagesMap.get('converted')
          ? (stagesMap.get('converted')! / stagesMap.get('initiated')!)
          : 0,
    };

    // Get stats per variant (variant_0, variant_1, etc.)
    const byVariant = [];
    for (let i = 0; i < 2; i++) {
      const variantId = `variant_${i}`;
      const variantStats = await this.funnelAnalyticsService.computeFunnelStats(
        startDate,
        endDate,
        variantId,
      );

      if (variantStats.length > 0) {
        const variantStagesMap = new Map(variantStats.map((s) => [s.stage, s.users]));
        const conversionRate =
          variantStagesMap.get('initiated') && variantStagesMap.get('converted')
            ? (variantStagesMap.get('converted')! / variantStagesMap.get('initiated')!)
            : 0;

        byVariant.push({
          variantId,
          stages: variantStats.map((s) => ({
            stage: s.stage,
            users: s.users,
            dropOffRate: s.dropOffRate,
          })),
          conversionRate,
        });
      }
    }

    // Generate recommendations
    const recommendations = this.funnelAnalyticsService.getConversionRecommendations(
      overallConversion,
      byVariant,
    );

    return {
      overallConversion,
      byVariant,
      recommendations,
    };
  }

  /**
   * Get all A/B experiments (Phase 10 Plan 02 Task 3).
   *
   * @returns Array of experiments
   */
  @Get('experiments')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get A/B experiments' })
  @ApiResponse({ status: 200, description: 'A/B experiments', type: [AnalyticsABExperiment] })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  async getExperiments(): Promise<AnalyticsABExperiment[]> {
    return this.experimentRepository.find({ order: { created_at: 'DESC' } });
  }

  /**
   * Create a new A/B experiment (Phase 10 Plan 02 Task 3).
   *
   * @param body - Experiment data
   * @returns Created experiment
   */
  @Post('experiments')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create A/B experiment' })
  @ApiResponse({ status: 201, description: 'Experiment created', type: AnalyticsABExperiment })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  @ApiResponse({ status: 400, description: 'Validation error (start_date >= end_date or variant_count < 2)' })
  async createExperiment(@Body() body: ABExperimentDto): Promise<AnalyticsABExperiment> {
    // Validation: start_date < end_date
    if (body.end_date && new Date(body.start_date) >= new Date(body.end_date)) {
      throw new Error('start_date must be before end_date');
    }

    // Validation: variant_count >= 2
    if (body.variant_count && body.variant_count < 2) {
      throw new Error('variant_count must be at least 2');
    }

    const experiment = this.experimentRepository.create({
      experiment_id: body.experiment_id,
      name: body.name,
      description: body.description,
      variant_count: body.variant_count || 2,
      variant_names: body.variant_names,
      start_date: new Date(body.start_date),
      end_date: body.end_date ? new Date(body.end_date) : null,
      active: true,
    });

    return this.experimentRepository.save(experiment);
  }

  /**
   * Update an A/B experiment (Phase 10 Plan 02 Task 3).
   *
   * @param id - Experiment ID
   * @param body - Updated experiment data
   * @returns Updated experiment
   */
  @Post('experiments/:id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update A/B experiment' })
  @ApiResponse({ status: 200, description: 'Experiment updated', type: AnalyticsABExperiment })
  @ApiResponse({ status: 401, description: 'Unauthorized - requires OPERATOR api-key' })
  @ApiResponse({ status: 404, description: 'Experiment not found' })
  async updateExperiment(
    @Param('id') id: string,
    @Body() body: Partial<ABExperimentDto>,
  ): Promise<AnalyticsABExperiment> {
    const experiment = await this.experimentRepository.findOne({ where: { id: parseInt(id) } });

    if (!experiment) {
      throw new Error(`Experiment with ID ${id} not found`);
    }

    // Update allowed fields
    if (body.name) experiment.name = body.name;
    if (body.description !== undefined) experiment.description = body.description;
    if (body.end_date) experiment.end_date = new Date(body.end_date);
    if (body.variant_names) experiment.variant_names = body.variant_names;

    return this.experimentRepository.save(experiment);
  }

  /**
   * Get satisfaction metrics (NPS, CSAT, correlation).
   * Phase 10 Plan 03 Task 3.
   *
   * @param query - Date range filter
   * @returns NPS, CSAT, and correlation metrics
   */
  @Get('satisfaction')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get satisfaction metrics (NPS, CSAT, correlation)' })
  @ApiResponse({ status: 200, description: 'Satisfaction metrics', type: SatisfactionResponseDto })
  async getSatisfaction(@Query() query: SatisfactionQueryDto): Promise<SatisfactionResponseDto> {
    const startDate = query.startDate ? new Date(query.startDate) : this.getDefaultStartDate();
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Fetch all satisfaction responses in date range
    const responses = await this.satisfactionResponseRepository.find({
      where: {
        responded_at: {
          $gte: startDate,
          $lte: endDate,
        } as any,
      },
      order: { responded_at: 'DESC' },
    });

    // Separate NPS and CSAT responses
    const npsResponses = responses.filter((r) => r.survey_type === 'nps');
    const csatResponses = responses.filter((r) => r.survey_type === 'csat');

    // Calculate NPS metrics
    const npsScores = npsResponses.map((r) => r.score);
    const npsOverall = this.satisfactionSurveyService.calculateNPS(npsScores);
    const npsPromoters = npsScores.filter((s) => s >= 9).length;
    const npsPassives = npsScores.filter((s) => s >= 7 && s <= 8).length;
    const npsDetractors = npsScores.filter((s) => s <= 6).length;
    const npsTotal = npsScores.length;

    // Calculate CSAT metrics
    const csatScores = csatResponses.map((r) => r.score);
    const csatOverall = this.satisfactionSurveyService.calculateCSAT(csatScores);
    const csatAvgRating = csatScores.length > 0
      ? csatScores.reduce((sum, s) => sum + s, 0) / csatScores.length
      : 0;

    // Calculate response rates (responses / conversations ended)
    const conversationsEndedCount = await this.analyticsEventRepository
      .createQueryBuilder('ae')
      .where('ae.event_type IN (:...types)', { types: ['conversation.resolved', 'conversation.escalated'] })
      .andWhere('ae.created_at >= :startDate', { startDate })
      .andWhere('ae.created_at <= :endDate', { endDate })
      .getCount();

    const npsResponseRate = conversationsEndedCount > 0 ? npsTotal / conversationsEndedCount : 0;
    const csatResponseRate = conversationsEndedCount > 0 ? csatScores.length / conversationsEndedCount : 0;

    // Calculate NPS trend (daily aggregation)
    const npsTrend = await this.calculateNpsTrend(startDate, endDate);

    // Calculate CSAT distribution
    const csatDistribution = this.calculateCsatDistribution(csatScores);

    // Get correlation by outcome
    const correlation = await this.satisfactionSurveyService.getCorrelationByOutcome(startDate, endDate);

    return {
      nps: {
        overall: npsOverall,
        promoters: npsTotal > 0 ? Math.round((npsPromoters / npsTotal) * 100) : 0,
        passives: npsTotal > 0 ? Math.round((npsPassives / npsTotal) * 100) : 0,
        detractors: npsTotal > 0 ? Math.round((npsDetractors / npsTotal) * 100) : 0,
        responseRate: Math.round(npsResponseRate * 100) / 100,
        trend: npsTrend,
      },
      csat: {
        overall: csatOverall,
        avgRating: Math.round(csatAvgRating * 10) / 10,
        responseRate: Math.round(csatResponseRate * 100) / 100,
        distribution: csatDistribution,
      },
      correlation,
    };
  }

  /**
   * Calculate NPS trend over time (daily aggregation).
   */
  private async calculateNpsTrend(
    startDate: Date,
    endDate: Date,
  ): Promise<Array<{ date: string; nps: number }>> {
    const responses = await this.satisfactionResponseRepository
      .createQueryBuilder('sr')
      .where('sr.survey_type = :type', { type: 'nps' })
      .andWhere('sr.responded_at >= :startDate', { startDate })
      .andWhere('sr.responded_at <= :endDate', { endDate })
      .orderBy('sr.responded_at', 'ASC')
      .getMany();

    // Group by date
    const byDate: Record<string, number[]> = {};
    for (const response of responses) {
      const date = response.responded_at.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(response.score);
    }

    // Calculate NPS per day
    const trend: Array<{ date: string; nps: number }> = [];
    for (const [date, scores] of Object.entries(byDate)) {
      const nps = this.satisfactionSurveyService.calculateNPS(scores);
      trend.push({ date, nps });
    }

    return trend;
  }

  /**
   * Calculate CSAT distribution (count per rating 1-5).
   */
  private calculateCsatDistribution(scores: number[]): Array<{ rating: number; count: number }> {
    const distribution = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: scores.filter((s) => s === rating).length,
    }));
    return distribution;
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

  /**
   * GET /api/analytics/dashboard/insights
   *
   * Predictive Insights Card - dashboard integration (Phase 10 Plan 04).
   * Returns high escalation risk count, peak volume forecast, recent anomalies.
   */
  @Get('dashboard/insights')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get predictive insights summary for dashboard' })
  @ApiResponse({ status: 200, description: 'Predictive insights returned' })
  async getDashboardInsights(): Promise<{
    highEscalationRiskCount: number;
    peakVolumeForecast: { hour: string; predicted_messages: number };
    recentAnomalies: Array<{ timestamp: string; metric: string; score: number }>;
  }> {
    // Query active conversations (last 24h without resolved/escalated event)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeConversations = await this.analyticsEventRepository
      .createQueryBuilder('ae')
      .select('DISTINCT ae.conversation_id', 'conversation_id')
      .where('ae.event_type = :type', { type: 'message.processed' })
      .andWhere('ae.created_at >= :oneDayAgo', { oneDayAgo })
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM analytics_events ae2
        WHERE ae2.conversation_id = ae.conversation_id
          AND ae2.event_type IN ('conversation.resolved', 'conversation.escalated')
      )`)
      .getRawMany();

    // Predict escalation risk for each active conversation
    let highRiskCount = 0;
    for (const conv of activeConversations.slice(0, 50)) {
      // Limit to 50 for performance
      try {
        const prediction = await this.predictiveModelsService.predictOutcome(
          conv.conversation_id,
        );
        if (prediction.probability > 0.75) {
          highRiskCount++;
        }
      } catch (error) {
        // Skip conversations that fail prediction (e.g., model not trained)
        continue;
      }
    }

    const highEscalationRiskPercent =
      activeConversations.length > 0
        ? Math.round((highRiskCount / Math.min(activeConversations.length, 50)) * 100)
        : 0;

    // Get peak volume forecast (mock for now - LSTM implementation in progress)
    const now = new Date();
    const forecast = [];
    let maxMessages = 0;
    let peakHour = '';

    for (let i = 0; i < 24; i++) {
      const hour = new Date(now.getTime() + i * 60 * 60 * 1000);
      const predicted = Math.floor(30 + Math.random() * 90); // Mock: 30-120 messages

      if (predicted > maxMessages) {
        maxMessages = predicted;
        peakHour = hour.toISOString();
      }

      forecast.push({
        hour: hour.toISOString(),
        predicted_messages: predicted,
      });
    }

    // Get recent anomalies (last 24h)
    const recentAnomalies = [];
    // Mock implementation - real implementation would query hourly aggregates
    // and run anomaly detection autoencoder
    const anomaly = {
      timestamp: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      metric: 'fallback_rate',
      score: 0.08, // Above threshold 0.05
    };
    recentAnomalies.push(anomaly);

    return {
      highEscalationRiskCount: highEscalationRiskPercent,
      peakVolumeForecast: {
        hour: peakHour,
        predicted_messages: maxMessages,
      },
      recentAnomalies,
    };
  }
}
