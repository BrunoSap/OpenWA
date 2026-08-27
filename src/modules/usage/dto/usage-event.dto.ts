/**
 * DTO for usage tracking events
 * Phase 09 Plan 03: Stripe billing integration
 */
export class UsageEventDto {
  tenantId!: string;
  eventType!: string;
  count!: number;
  metadata?: Record<string, any>;
}
