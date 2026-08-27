import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Phase 5 Plan 02: Query params for conversation history endpoint (MEM-04).
 *
 * Pagination parameters with validation:
 * - take: max results per page (default 50, capped at 100) (T-05-05)
 * - skip: offset for pagination (default 0, min 0) (T-05-05)
 */
export class GetConversationHistoryDto {
  /**
   * Maximum number of messages to return.
   * Default: 50, Max: 100 (T-05-05 DoS mitigation)
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  take?: number = 50;

  /**
   * Number of messages to skip (for pagination).
   * Default: 0, Min: 0 (T-05-05)
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  skip?: number = 0;
}
