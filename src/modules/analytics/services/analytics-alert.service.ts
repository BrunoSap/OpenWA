import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsAlertRule } from '../entities/analytics-alert-rule.entity';
import { AnalyticsEventsService } from './analytics-events.service';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 6 Plan 03 Task 2: Analytics alert evaluation service (DASH-02).
 *
 * Evaluates enabled alert rules against current KPI values. Called by the
 * analytics-alert processor every 5 minutes. Returns breaching rules for dispatch.
 */

export interface AlertBreach {
  rule: AnalyticsAlertRule;
  currentValue: number;
}

@Injectable()
export class AnalyticsAlertService {
  private readonly logger = createLogger('AnalyticsAlertService');

  constructor(
    @InjectRepository(AnalyticsAlertRule, 'data')
    private readonly alertRuleRepository: Repository<AnalyticsAlertRule>,
    private readonly analyticsService: AnalyticsEventsService,
  ) {}

  /**
   * Evaluates all enabled alert rules against current metrics.
   *
   * @returns Array of breaching rules with their current values
   */
  async evaluateRules(): Promise<AlertBreach[]> {
    const rules = await this.alertRuleRepository.find({
      where: { enabled: true },
    });

    if (rules.length === 0) {
      this.logger.debug('No enabled alert rules to evaluate');
      return [];
    }

    this.logger.log(`Evaluating ${rules.length} alert rules`);

    const breaches: AlertBreach[] = [];

    // Get current KPIs (rolling 24h window)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setUTCHours(startDate.getUTCHours() - 24);

    const overview = await this.analyticsService.getOverview(startDate, endDate);

    for (const rule of rules) {
      // Skip disabled rules (safety check, should already be filtered by query)
      if (!rule.enabled) {
        continue;
      }

      const currentValue = this.resolveMetricValue(rule.metric, overview);

      if (currentValue === null) {
        this.logger.warn(`Metric ${rule.metric} could not be resolved for rule ${rule.id}`);
        continue;
      }

      const breached = this.evaluateCondition(rule.condition, currentValue, rule.threshold);

      if (breached) {
        this.logger.log(
          `Rule ${rule.id} breached: ${rule.metric} ${rule.condition} ${rule.threshold} (current: ${currentValue})`,
        );
        breaches.push({ rule, currentValue });
      }
    }

    return breaches;
  }

  /**
   * Resolves metric value from overview KPIs.
   *
   * @param metric - Metric name
   * @param overview - Analytics overview response
   * @returns Metric value or null if not found
   */
  private resolveMetricValue(metric: string, overview: any): number | null {
    const metricMap: Record<string, () => number | null> = {
      fallback_rate: () => overview.kpis.fallbackRate,
      resolution_rate: () => overview.kpis.resolutionRate,
      cost_per_conversation: () => overview.kpis.costPerConversation,
      cost_total_usd: () => overview.kpis.costPerConversation * 100, // Placeholder approximation
      latency_p95: () => {
        // Compute p95 from latencyChart (last data point)
        const latencyData = overview.latencyChart;
        return latencyData.length > 0 ? latencyData[latencyData.length - 1].value : null;
      },
    };

    const resolver = metricMap[metric];
    return resolver ? resolver() : null;
  }

  /**
   * Evaluates a condition (above or below).
   *
   * @param condition - Condition operator (above|below)
   * @param currentValue - Current metric value
   * @param threshold - Threshold to compare against
   * @returns True if condition breached
   */
  private evaluateCondition(condition: string, currentValue: number, threshold: number): boolean {
    if (condition === 'above') {
      return currentValue > threshold;
    }
    if (condition === 'below') {
      return currentValue < threshold;
    }
    this.logger.warn(`Unknown condition: ${condition}`);
    return false;
  }
}
