import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AnalyticsEvent } from '../entities/analytics-event.entity';

/**
 * Phase 6 Plan 03 Task 1: Export service for CSV/JSON downloads.
 *
 * Exports analytics events for a given date range in CSV or JSON format.
 * CSV format uses quote-escaped fields for Excel/Sheets compatibility.
 */
@Injectable()
export class AnalyticsExportService {
  constructor(
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly analyticsRepository: Repository<AnalyticsEvent>,
  ) {}

  /**
   * Exports analytics events in CSV or JSON format.
   *
   * @param startDate - Start of range
   * @param endDate - End of range
   * @param format - Output format (csv or json)
   * @returns CSV string or JSON array
   */
  async exportEvents(
    startDate: Date,
    endDate: Date,
    format: 'csv' | 'json' = 'csv',
  ): Promise<string | AnalyticsEvent[]> {
    const events = await this.analyticsRepository.find({
      where: {
        created_at: Between(startDate, endDate),
      },
      order: { created_at: 'DESC' },
    });

    if (format === 'json') {
      return events;
    }

    // CSV format with header row
    return this.generateCSV(events);
  }

  /**
   * Generates CSV string from analytics events.
   *
   * @param events - Events to export
   * @returns CSV string with header + data rows
   */
  private generateCSV(events: AnalyticsEvent[]): string {
    const headers = [
      'id',
      'event_type',
      'session_id',
      'chat_id',
      'user_id',
      'conversation_id',
      'latency_ms',
      'tokens_used',
      'cost_usd',
      'created_at',
      'payload',
    ];

    const rows = events.map((event) =>
      [
        event.id,
        event.event_type,
        event.session_id || '',
        event.chat_id || '',
        event.user_id || '',
        event.conversation_id || '',
        event.latency_ms?.toString() || '',
        event.tokens_used?.toString() || '',
        event.cost_usd?.toString() || '',
        event.created_at.toISOString(),
        JSON.stringify(event.payload || {}),
      ].map(this.escapeCSVField),
    );

    const csvLines = [headers.join(','), ...rows.map((row) => row.join(','))];

    return csvLines.join('\n');
  }

  /**
   * Escapes a CSV field (quotes if contains comma, quote, or newline).
   *
   * @param field - Field value
   * @returns Escaped field
   */
  private escapeCSVField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}
