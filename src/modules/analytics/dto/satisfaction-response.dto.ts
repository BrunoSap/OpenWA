import { ApiProperty } from '@nestjs/swagger';

/**
 * Phase 10 Plan 03 Task 3: Response DTO for satisfaction analytics endpoint.
 *
 * Returns NPS, CSAT, and correlation metrics per RESEARCH.md L640-671.
 */
export class SatisfactionResponseDto {
  @ApiProperty({
    description: 'NPS (Net Promoter Score) metrics',
    example: {
      overall: 25,
      promoters: 45,
      passives: 35,
      detractors: 20,
      responseRate: 0.32,
      trend: [
        { date: '2026-08-20', nps: 20 },
        { date: '2026-08-21', nps: 25 },
      ],
    },
  })
  nps!: {
    overall: number;
    promoters: number;
    passives: number;
    detractors: number;
    responseRate: number;
    trend: Array<{ date: string; nps: number }>;
  };

  @ApiProperty({
    description: 'CSAT (Customer Satisfaction) metrics',
    example: {
      overall: 84.0,
      avgRating: 4.2,
      responseRate: 0.28,
      distribution: [
        { rating: 1, count: 5 },
        { rating: 2, count: 8 },
        { rating: 3, count: 15 },
        { rating: 4, count: 30 },
        { rating: 5, count: 42 },
      ],
    },
  })
  csat!: {
    overall: number;
    avgRating: number;
    responseRate: number;
    distribution: Array<{ rating: number; count: number }>;
  };

  @ApiProperty({
    description: 'Correlation between conversation outcome and satisfaction',
    example: {
      resolvedNps: 8.5,
      escalatedNps: 5.2,
      delta: 3.3,
    },
  })
  correlation!: {
    resolvedNps: number;
    escalatedNps: number;
    delta: number;
  };
}
