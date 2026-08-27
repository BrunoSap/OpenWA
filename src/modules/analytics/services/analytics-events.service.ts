import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from '../entities/analytics-event.entity';

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
}
