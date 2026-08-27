import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from '../entities/analytics-event.entity';

interface FunnelStageStats {
  stage: string;
  users: number;
  dropOffRate: number | null;
  previousStageUsers: number | null;
}

interface OverallStats {
  initiated: number;
  qualified: number;
  data_collected: number;
  exported: number;
  converted: number;
  conversionRate: number;
}

interface VariantStats {
  variantId: string;
  stages: FunnelStageStats[];
  conversionRate: number;
}

/**
 * Phase 10 Plan 02 Task 2: Funnel analytics service with stage tracking and drop-off calculation (DASH-04).
 *
 * Computes funnel progression metrics from analytics_events (event_type='funnel.stage_entered').
 * Drop-off rate calculated using LAG window function per RESEARCH.md L345-367.
 * Supports A/B test variant filtering and generates conversion recommendations.
 */
@Injectable()
export class FunnelAnalyticsService {
  private readonly stageOrder: Record<string, number> = {
    initiated: 1,
    qualified: 2,
    data_collected: 3,
    exported: 4,
    converted: 5,
  };

  constructor(
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly eventRepository: Repository<AnalyticsEvent>,
  ) {}

  /**
   * Compute funnel statistics with drop-off rates per stage.
   *
   * @param startDate - Start date for analysis
   * @param endDate - End date for analysis
   * @param variantId - Optional A/B test variant filter
   * @returns Array of stage stats with drop-off rates
   */
  async computeFunnelStats(
    startDate: Date,
    endDate: Date,
    variantId?: string,
  ): Promise<FunnelStageStats[]> {
    let query = this.eventRepository
      .createQueryBuilder('event')
      .select("event.payload->>'stage'", 'stage')
      .addSelect('COUNT(DISTINCT event.user_id)', 'users')
      .where("event.event_type = 'funnel.stage_entered'")
      .andWhere('event.created_at >= :startDate', { startDate })
      .andWhere('event.created_at <= :endDate', { endDate })
      .groupBy("event.payload->>'stage'");

    if (variantId) {
      query = query.andWhere("event.payload->>'variantId' = :variantId", { variantId });
    }

    const rawResults = await query.getRawMany();

    // Add stage_order for sorting
    const resultsWithOrder = rawResults.map((row) => ({
      stage: row.stage,
      users: parseInt(row.users, 10),
      stage_order: this.stageOrder[row.stage] || 999,
    }));

    // Sort by stage order
    resultsWithOrder.sort((a, b) => a.stage_order - b.stage_order);

    // Compute drop-off rates
    const stats: FunnelStageStats[] = resultsWithOrder.map((row, index) => {
      if (index === 0) {
        // First stage has no previous stage
        return {
          stage: row.stage,
          users: row.users,
          dropOffRate: null,
          previousStageUsers: null,
        };
      }

      const previousStageUsers = resultsWithOrder[index - 1].users;
      const dropOffRate = 1 - row.users / previousStageUsers;

      return {
        stage: row.stage,
        users: row.users,
        dropOffRate,
        previousStageUsers,
      };
    });

    return stats;
  }

  /**
   * Generate conversion recommendations based on variant performance.
   *
   * @param overallStats - Overall funnel statistics
   * @param byVariant - Per-variant statistics
   * @returns Array of recommendation strings
   */
  getConversionRecommendations(overallStats: OverallStats, byVariant: VariantStats[]): string[] {
    const recommendations: string[] = [];

    if (byVariant.length < 2) {
      return recommendations;
    }

    // Compare all variants
    for (let i = 0; i < byVariant.length; i++) {
      for (let j = i + 1; j < byVariant.length; j++) {
        const variantA = byVariant[i];
        const variantB = byVariant[j];

        const delta = Math.abs(variantA.conversionRate - variantB.conversionRate);
        const relativeImprovement = delta / Math.min(variantA.conversionRate, variantB.conversionRate);

        if (relativeImprovement > 0.10) {
          // >10% improvement
          const better = variantA.conversionRate > variantB.conversionRate ? variantA : variantB;
          const worse = variantA.conversionRate > variantB.conversionRate ? variantB : variantA;

          const improvementPercent = (relativeImprovement * 100).toFixed(0);
          recommendations.push(
            `Variant '${better.variantId}' has ${improvementPercent}% higher conversion than '${worse.variantId}' (${(better.conversionRate * 100).toFixed(1)}% vs ${(worse.conversionRate * 100).toFixed(1)}%)`,
          );
        }
      }
    }

    return recommendations;
  }
}
