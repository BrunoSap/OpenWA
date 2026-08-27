import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsSatisfactionResponse } from '../entities/analytics-satisfaction-response.entity';
import { AnalyticsEvent } from '../entities/analytics-event.entity';

/**
 * Phase 10 Plan 03 Task 1: Satisfaction survey calculation service.
 *
 * Implements NPS and CSAT calculation formulas per RESEARCH.md L557-586:
 * - NPS: ((promoters - detractors) / total) * 100, range -100 to +100
 * - CSAT: (avgRating / 5) * 100, range 0-100
 *
 * Provides correlation analytics showing satisfaction difference between
 * resolved and escalated conversations (RESEARCH.md L610-632).
 */
@Injectable()
export class SatisfactionSurveyService {
  constructor(
    @InjectRepository(AnalyticsSatisfactionResponse, 'data')
    private readonly satisfactionRepo: Repository<AnalyticsSatisfactionResponse>,
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly eventsRepo: Repository<AnalyticsEvent>,
  ) {}

  /**
   * Calculate NPS (Net Promoter Score) from response array.
   * Formula: ((promoters - detractors) / total) * 100
   * - Promoters: scores 9-10
   * - Detractors: scores 0-6
   * - Passives: scores 7-8 (excluded from calculation)
   * @param responses Array of NPS scores (0-10)
   * @returns NPS score (-100 to +100), 0 if empty array
   */
  calculateNPS(responses: number[]): number {
    const total = responses.length;
    if (total === 0) return 0;

    const promoters = responses.filter((r) => r >= 9).length; // 9-10
    const detractors = responses.filter((r) => r <= 6).length; // 0-6
    // Passives (7-8) não entram no cálculo

    const nps = ((promoters - detractors) / total) * 100;
    return Math.round(nps); // Range: -100 to +100
  }

  /**
   * Calculate CSAT (Customer Satisfaction) percentage from ratings.
   * Formula: (avgRating / 5) * 100
   * Assumes 5-point scale (1-5).
   * @param ratings Array of CSAT ratings (1-5)
   * @returns CSAT percentage (0-100), rounded to 1 decimal place, 0 if empty array
   */
  calculateCSAT(ratings: number[]): number {
    if (ratings.length === 0) return 0;

    const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    const csat = (avgRating / 5) * 100; // Assuming 5-point scale
    return Math.round(csat * 10) / 10; // Range: 0-100, rounded to 1 decimal
  }

  /**
   * Get NPS correlation by conversation outcome (resolved vs escalated).
   * Joins satisfaction_responses with analytics_events to determine if conversation
   * ended in resolution or escalation, then computes average NPS per outcome.
   * @param startDate Start of date range
   * @param endDate End of date range
   * @returns Object with resolvedNps, escalatedNps, and delta
   */
  async getCorrelationByOutcome(
    startDate: Date,
    endDate: Date,
  ): Promise<{ resolvedNps: number; escalatedNps: number; delta: number }> {
    // Query: Group satisfaction responses by conversation outcome
    // Per RESEARCH.md L610-632, determine outcome by checking for escalation event
    const results = await this.satisfactionRepo
      .createQueryBuilder('sr')
      .leftJoin(
        AnalyticsEvent,
        'ae',
        'ae.conversation_id = sr.conversation_id AND ae.event_type IN (:...eventTypes)',
        { eventTypes: ['conversation.resolved', 'conversation.escalated'] },
      )
      .where('sr.survey_type = :surveyType', { surveyType: 'nps' })
      .andWhere('sr.responded_at >= :startDate', { startDate })
      .andWhere('sr.responded_at <= :endDate', { endDate })
      .select(
        `CASE
          WHEN EXISTS (
            SELECT 1 FROM analytics_events ae2
            WHERE ae2.conversation_id = sr.conversation_id
              AND ae2.event_type = 'conversation.escalated'
          ) THEN 'escalated'
          ELSE 'resolved'
        END`,
        'outcome',
      )
      .addSelect('AVG(sr.score)', 'avg_nps')
      .addSelect('COUNT(*)', 'count')
      .groupBy('outcome')
      .getRawMany();

    // Parse results
    let resolvedNps = 0;
    let escalatedNps = 0;

    for (const row of results) {
      const avgNps = parseFloat(row.avg_nps) || 0;
      if (row.outcome === 'resolved') {
        resolvedNps = avgNps;
      } else if (row.outcome === 'escalated') {
        escalatedNps = avgNps;
      }
    }

    const delta = resolvedNps - escalatedNps;

    return { resolvedNps, escalatedNps, delta };
  }
}
