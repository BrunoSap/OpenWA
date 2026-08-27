import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import {
  AnalyticsOverviewResponse,
  AnalyticsPerformanceResponse,
  AnalyticsCostResponse,
  AnalyticsConversationsResponse,
  ConversationSummary,
} from '../dto/analytics-response.dto';
import { percentile } from './percentile.util';

@Injectable()
export class AnalyticsEventsService {
  constructor(
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly analyticsRepository: Repository<AnalyticsEvent>,
  ) {}

  /**
   * Records a new analytics event with extracted metrics and flexible payload.
   *
   * @param partial - Event data to persist (event_type required, rest optional)
   * @returns The persisted event with generated id and created_at
   */
  async recordEvent(partial: Partial<AnalyticsEvent>): Promise<AnalyticsEvent> {
    const event = this.analyticsRepository.create({
      ...partial,
      payload: partial.payload ?? {},
    });
    return this.analyticsRepository.save(event);
  }

  /**
   * Retrieves the most recent analytics events ordered by creation time.
   *
   * @param limit - Maximum number of events to return (default 100, clamped to 100 max)
   * @returns Array of recent events, newest first
   */
  async listRecent(limit: number = 100): Promise<AnalyticsEvent[]> {
    const clampedLimit = Math.min(limit, 100);
    return this.analyticsRepository.find({
      order: { created_at: 'DESC' },
      take: clampedLimit,
    });
  }

  /**
   * Get overview KPIs and time-series charts for the dashboard.
   *
   * @param startDate - Start of range
   * @param endDate - End of range
   * @param sessionId - Optional session filter
   * @returns Overview KPIs + charts
   */
  async getOverview(
    startDate: Date,
    endDate: Date,
    sessionId?: string,
  ): Promise<AnalyticsOverviewResponse> {
    const whereClause: any = {
      created_at: Between(startDate, endDate),
    };
    if (sessionId) {
      whereClause.session_id = sessionId;
    }

    const events = await this.analyticsRepository.find({
      where: whereClause,
      order: { created_at: 'ASC' },
    });

    // Compute KPIs
    const conversationsStarted = events.filter((e) => e.event_type === 'conversation.started').length;
    const conversationsResolved = events.filter((e) => e.event_type === 'conversation.resolved').length;
    const messagesProcessed = events.filter((e) => e.event_type === 'message.processed').length;
    const fallbacksTriggered = events.filter((e) => e.event_type === 'fallback.triggered').length;

    const resolutionRate =
      conversationsStarted > 0 ? (conversationsResolved / conversationsStarted) * 100 : 0;
    const fallbackRate = messagesProcessed > 0 ? (fallbacksTriggered / messagesProcessed) * 100 : 0;

    const totalCost = events
      .filter((e) => e.event_type === 'llm.called')
      .reduce((sum, e) => sum + (Number(e.cost_usd) || 0), 0);
    const costPerConversation = conversationsStarted > 0 ? totalCost / conversationsStarted : 0;

    // DAU: distinct users today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dauEvents = await this.analyticsRepository
      .createQueryBuilder('event')
      .select('DISTINCT event.user_id')
      .where('event.created_at >= :today', { today })
      .andWhere('event.created_at < :tomorrow', { tomorrow })
      .andWhere('event.user_id IS NOT NULL')
      .getRawMany();
    const dau = dauEvents.length;

    // MAU: distinct users this month
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const mauEvents = await this.analyticsRepository
      .createQueryBuilder('event')
      .select('DISTINCT event.user_id')
      .where('event.created_at >= :monthStart', { monthStart })
      .andWhere('event.created_at < :monthEnd', { monthEnd })
      .andWhere('event.user_id IS NOT NULL')
      .getRawMany();
    const mau = mauEvents.length;

    // Time-series charts (simplified: group by day)
    const messagesChart = this.groupByDay(
      events.filter((e) => e.event_type === 'message.processed'),
    );
    const latencyChart = this.groupLatencyByDay(
      events.filter((e) => e.event_type === 'message.processed'),
    );
    const costChart = this.groupCostByDay(events.filter((e) => e.event_type === 'llm.called'));

    return {
      kpis: {
        resolutionRate: Math.round(resolutionRate * 100) / 100,
        fallbackRate: Math.round(fallbackRate * 100) / 100,
        costPerConversation: Math.round(costPerConversation * 10000) / 10000,
        dau,
        mau,
      },
      messagesChart,
      latencyChart,
      costChart,
    };
  }

  /**
   * Get latency percentiles over time.
   *
   * @param startDate - Start of range
   * @param endDate - End of range
   * @param granularity - Time bucket (hour/day/week)
   * @returns Percentile time-series
   */
  async getPerformance(
    startDate: Date,
    endDate: Date,
    granularity: string = 'day',
  ): Promise<AnalyticsPerformanceResponse> {
    const events = await this.analyticsRepository.find({
      where: {
        created_at: Between(startDate, endDate),
        event_type: 'message.processed',
      },
      order: { created_at: 'ASC' },
    });

    // Group by day and compute percentiles per bucket
    const buckets = new Map<string, number[]>();
    for (const event of events) {
      if (event.latency_ms == null) continue;
      const bucket = this.getBucketKey(event.created_at, granularity);
      if (!buckets.has(bucket)) {
        buckets.set(bucket, []);
      }
      buckets.get(bucket)!.push(event.latency_ms);
    }

    const latency = Array.from(buckets.entries())
      .map(([bucket, latencies]) => ({
        timestamp: new Date(bucket),
        p50: Math.round(percentile(latencies, 0.5) || 0),
        p95: Math.round(percentile(latencies, 0.95) || 0),
        p99: Math.round(percentile(latencies, 0.99) || 0),
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return { latency };
  }

  /**
   * Get cost breakdown by provider or session.
   *
   * @param startDate - Start of range
   * @param endDate - End of range
   * @param groupBy - Group dimension (provider or session)
   * @returns Total cost + breakdown
   */
  async getCost(
    startDate: Date,
    endDate: Date,
    groupBy: string = 'provider',
  ): Promise<AnalyticsCostResponse> {
    const events = await this.analyticsRepository.find({
      where: {
        created_at: Between(startDate, endDate),
        event_type: 'llm.called',
      },
    });

    const total = events.reduce((sum, e) => sum + (Number(e.cost_usd) || 0), 0);

    // Group by provider or session
    const groups = new Map<string, { cost: number; tokens: number }>();
    for (const event of events) {
      const key =
        groupBy === 'provider'
          ? (event.payload?.provider as string) || 'unknown'
          : event.session_id || 'unknown';
      if (!groups.has(key)) {
        groups.set(key, { cost: 0, tokens: 0 });
      }
      const group = groups.get(key)!;
      group.cost += Number(event.cost_usd) || 0;
      group.tokens += event.tokens_used || 0;
    }

    const breakdown = Array.from(groups.entries())
      .map(([key, data]) => ({
        key,
        cost: Math.round(data.cost * 10000) / 10000,
        tokens: data.tokens,
      }))
      .sort((a, b) => b.cost - a.cost);

    return {
      total: Math.round(total * 10000) / 10000,
      breakdown,
    };
  }

  /**
   * Get paginated conversations list.
   *
   * @param startDate - Start of range
   * @param endDate - End of range
   * @param sessionId - Optional session filter
   * @param page - Page number (1-indexed)
   * @param limit - Page size
   * @returns Paginated conversations
   */
  async getConversations(
    startDate: Date,
    endDate: Date,
    sessionId?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<AnalyticsConversationsResponse> {
    const whereClause: any = {
      created_at: Between(startDate, endDate),
    };
    if (sessionId) {
      whereClause.session_id = sessionId;
    }

    const events = await this.analyticsRepository.find({
      where: whereClause,
      order: { created_at: 'ASC' },
    });

    // Group by conversation_id
    const conversations = new Map<
      string,
      {
        session_id: string;
        messages: number;
        cost: number;
        latencies: number[];
        started_at: Date;
        ended_at: Date;
      }
    >();

    for (const event of events) {
      const convId = event.conversation_id || 'unknown';
      if (!conversations.has(convId)) {
        conversations.set(convId, {
          session_id: event.session_id || 'unknown',
          messages: 0,
          cost: 0,
          latencies: [],
          started_at: event.created_at,
          ended_at: event.created_at,
        });
      }

      const conv = conversations.get(convId)!;
      if (event.event_type === 'message.processed') {
        conv.messages++;
        if (event.latency_ms != null) {
          conv.latencies.push(event.latency_ms);
        }
      }
      if (event.event_type === 'llm.called') {
        conv.cost += Number(event.cost_usd) || 0;
      }
      conv.ended_at = event.created_at;
    }

    // Convert to array and paginate
    const allConversations: ConversationSummary[] = Array.from(conversations.entries())
      .map(([conversation_id, data]) => ({
        conversation_id,
        session_id: data.session_id,
        message_count: data.messages,
        cost: Math.round(data.cost * 10000) / 10000,
        avg_latency:
          data.latencies.length > 0
            ? Math.round(data.latencies.reduce((s, l) => s + l, 0) / data.latencies.length)
            : 0,
        started_at: data.started_at,
        ended_at: data.ended_at,
      }))
      .sort((a, b) => b.started_at.getTime() - a.started_at.getTime());

    const total = allConversations.length;
    const offset = (page - 1) * limit;
    const data = allConversations.slice(offset, offset + limit);

    return { data, total, page, limit };
  }

  // Helper: group events by day
  private groupByDay(events: AnalyticsEvent[]): Array<{ timestamp: Date; value: number }> {
    const buckets = new Map<string, number>();
    for (const event of events) {
      const day = event.created_at.toISOString().split('T')[0];
      buckets.set(day, (buckets.get(day) || 0) + 1);
    }
    return Array.from(buckets.entries())
      .map(([day, value]) => ({ timestamp: new Date(day), value }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Helper: group latency by day (p95)
  private groupLatencyByDay(events: AnalyticsEvent[]): Array<{ timestamp: Date; value: number }> {
    const buckets = new Map<string, number[]>();
    for (const event of events) {
      if (event.latency_ms == null) continue;
      const day = event.created_at.toISOString().split('T')[0];
      if (!buckets.has(day)) {
        buckets.set(day, []);
      }
      buckets.get(day)!.push(event.latency_ms);
    }
    return Array.from(buckets.entries())
      .map(([day, latencies]) => ({
        timestamp: new Date(day),
        value: Math.round(percentile(latencies, 0.95) || 0),
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Helper: group cost by day
  private groupCostByDay(events: AnalyticsEvent[]): Array<{ timestamp: Date; value: number }> {
    const buckets = new Map<string, number>();
    for (const event of events) {
      const day = event.created_at.toISOString().split('T')[0];
      buckets.set(day, (buckets.get(day) || 0) + (Number(event.cost_usd) || 0));
    }
    return Array.from(buckets.entries())
      .map(([day, value]) => ({
        timestamp: new Date(day),
        value: Math.round(value * 10000) / 10000,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // Helper: get bucket key for granularity
  private getBucketKey(date: Date, granularity: string): string {
    const d = new Date(date);
    if (granularity === 'hour') {
      d.setMinutes(0, 0, 0);
      return d.toISOString();
    }
    if (granularity === 'week') {
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - day);
      d.setUTCHours(0, 0, 0, 0);
      return d.toISOString().split('T')[0];
    }
    // Default: day
    return d.toISOString().split('T')[0];
  }
}
