import { ApiProperty } from '@nestjs/swagger';

/**
 * Phase 10 Plan 01: Response DTO for intent analytics endpoints.
 *
 * Returns intent distribution (topIntents) and trends over time (trendsOverTime).
 */

export class TopIntentDto {
  @ApiProperty({ description: 'Intent name', example: 'FAQ' })
  intent!: string;

  @ApiProperty({ description: 'Number of messages classified with this intent', example: 450 })
  count!: number;

  @ApiProperty({ description: 'Percentage of total classified messages', example: 45.0 })
  percentage!: number;
}

export class IntentTrendDto {
  @ApiProperty({ description: 'Date (YYYY-MM-DD)', example: '2026-08-20' })
  date!: string;

  @ApiProperty({
    description: 'Intent counts per date',
    example: { FAQ: 50, 'Suporte Técnico': 30, Vendas: 15 },
  })
  intentCounts!: Record<string, number>;
}

export class IntentResponseDto {
  @ApiProperty({ description: 'Top intents by volume', type: [TopIntentDto] })
  topIntents!: TopIntentDto[];

  @ApiProperty({ description: 'Intent trends over time', type: [IntentTrendDto] })
  trendsOverTime!: IntentTrendDto[];
}
