/**
 * Phase 10 Plan 02 Task 3: Response schema for funnel analytics endpoint (DASH-04).
 * Matches RESEARCH.md L374-407 specification.
 */

export interface FunnelStageDto {
  stage: string;
  users: number;
  dropOffRate: number | null;
}

export interface OverallConversionDto {
  initiated: number;
  qualified: number;
  data_collected: number;
  exported: number;
  converted: number;
  conversionRate: number;
}

export interface VariantStatsDto {
  variantId: string;
  stages: FunnelStageDto[];
  conversionRate: number;
}

export interface FunnelResponseDto {
  overallConversion: OverallConversionDto;
  byVariant: VariantStatsDto[];
  recommendations: string[];
}
