import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import { AnalyticsAggregate } from '../entities/analytics-aggregate.entity';
import { percentile } from './percentile.util';

/**
 * Phase 6 Plan 02b: Analytics aggregation service (DASH-01, DASH-02).
 *
 * Computes KPI rollups from raw analytics_events and upserts them into analytics_aggregates.
 * Called by the daily BullMQ aggregation processor at 1 AM to pre-compute yesterday's metrics.
 *
 * KPI formulas (from RESEARCH.md §3):
 * - resolution_rate = (conversations_resolved / conversations_started) * 100, null when 0 started
 * - fallback_rate = (fallbacks_triggered / messages_processed) * 100, null when 0 processed
 * - latency percentiles computed via percentile.util (linear interpolation)
 * - cost_total_usd = SUM(cost_usd) from llm.called events
 * - tokens_total = SUM(tokens_used) from llm.called events
 */
@Injectable()
export class AnalyticsAggregationService {
  constructor(
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly eventRepository: Repository<AnalyticsEvent>,
    @InjectRepository(AnalyticsAggregate, 'data')
    private readonly aggregateRepository: Repository<AnalyticsAggregate>,
  ) {}

  /**
   * Compute aggregates from raw events for the given time range and granularity.
   *
   * @param start - Start of time range
   * @param end - End of time range
   * @param granularity - Aggregation level (hour, day, week)
   * @returns Array of computed aggregates, one per session
   */
  async computeAggregates(
    start: Date,
    end: Date,
    granularity: string,
  ): Promise<Partial<AnalyticsAggregate>[]> {
    // Fetch all events in the time range
    const events = await this.eventRepository.find({
      where: {
        created_at: Between(start, end),
      },
      order: { created_at: 'ASC' },
    });

    if (events.length === 0) {
      return [];
    }

    // Group events by session_id
    const sessionGroups = new Map<string, AnalyticsEvent[]>();
    for (const event of events) {
      const sessionId = event.session_id || 'global';
      if (!sessionGroups.has(sessionId)) {
        sessionGroups.set(sessionId, []);
      }
      sessionGroups.get(sessionId)!.push(event);
    }

    // Compute aggregates per session
    const aggregates: Partial<AnalyticsAggregate>[] = [];
    for (const [sessionId, sessionEvents] of sessionGroups.entries()) {
      const aggregate = this.computeSessionAggregate(start, granularity, sessionId, sessionEvents);
      aggregates.push(aggregate);
    }

    return aggregates;
  }

  /**
   * Compute aggregate metrics for a single session's events.
   */
  private computeSessionAggregate(
    timeBucket: Date,
    granularity: string,
    sessionId: string,
    events: AnalyticsEvent[],
  ): Partial<AnalyticsAggregate> {
    // Count events by type
    const conversations_started = events.filter((e) => e.event_type === 'conversation.started').length;
    const conversations_resolved = events.filter((e) => e.event_type === 'conversation.resolved').length;
    const conversations_escalated = events.filter((e) => e.event_type === 'conversation.escalated').length;
    const messages_processed = events.filter((e) => e.event_type === 'message.processed').length;
    const fallbacks_triggered = events.filter((e) => e.event_type === 'fallback.triggered').length;

    // Extract latencies from message.processed events
    const latencies = events
      .filter((e) => e.event_type === 'message.processed' && e.latency_ms != null)
      .map((e) => e.latency_ms!);

    // Compute latency percentiles
    const latency_p50_ms = latencies.length > 0 ? Math.round(percentile(latencies, 0.5)!) : undefined;
    const latency_p95_ms = latencies.length > 0 ? Math.round(percentile(latencies, 0.95)!) : undefined;
    const latency_p99_ms = latencies.length > 0 ? Math.round(percentile(latencies, 0.99)!) : undefined;

    // Sum tokens and cost from llm.called events
    const llmEvents = events.filter((e) => e.event_type === 'llm.called');
    const tokens_total = llmEvents.reduce((sum, e) => sum + (e.tokens_used || 0), 0);
    const cost_total_usd = llmEvents.reduce((sum, e) => sum + (Number(e.cost_usd) || 0), 0);

    // Compute quality metrics with divide-by-zero guards
    const resolution_rate =
      conversations_started > 0 ? (conversations_resolved / conversations_started) * 100 : undefined;
    const fallback_rate =
      messages_processed > 0 ? (fallbacks_triggered / messages_processed) * 100 : undefined;

    return {
      time_bucket: timeBucket,
      granularity,
      session_id: sessionId === 'global' ? undefined : sessionId,
      conversations_started,
      conversations_resolved,
      conversations_escalated,
      messages_processed,
      fallbacks_triggered,
      latency_p50_ms,
      latency_p95_ms,
      latency_p99_ms,
      tokens_total,
      cost_total_usd,
      resolution_rate: resolution_rate != null ? Math.round(resolution_rate * 100) / 100 : undefined,
      fallback_rate: fallback_rate != null ? Math.round(fallback_rate * 100) / 100 : undefined,
    };
  }

  /**
   * Upsert computed aggregates into the analytics_aggregates table.
   * Uses (time_bucket, granularity, session_id) as the unique key for idempotent upserts.
   *
   * @param aggregates - Array of computed aggregates to persist
   */
  async upsertAggregates(aggregates: Partial<AnalyticsAggregate>[]): Promise<void> {
    if (aggregates.length === 0) {
      return;
    }

    await this.aggregateRepository.upsert(aggregates, {
      conflictPaths: ['time_bucket', 'granularity', 'session_id'],
      skipUpdateIfNoValuesChanged: true,
    });
  }
}
