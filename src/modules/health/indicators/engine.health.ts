import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { SessionService } from '../../session/session.service';

/**
 * Custom health indicator for WhatsApp engine readiness.
 *
 * Validates that the SessionService can respond to queries without hanging
 * (no deadlock, no blocked event loop). Uses a timeout-bounded call to
 * findAll() — if it doesn't complete within 3s, the replica is unhealthy.
 *
 * This catches edge cases like:
 * - Engine registry lock contention
 * - Chromium zombie processes blocking getAllSessions()
 * - Event loop starvation
 */
@Injectable()
export class EngineHealthIndicator extends HealthIndicator {
  private readonly TIMEOUT_MS = 3000;

  constructor(private readonly sessionService: SessionService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Timeout-bounded call to SessionService — if it hangs, this throws
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SessionService timeout')), this.TIMEOUT_MS),
      );
      const sessionsPromise = this.sessionService.findAll();

      await Promise.race([sessionsPromise, timeoutPromise]);

      return this.getStatus(key, true, { status: 'up' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError(
        'Engine not ready',
        this.getStatus(key, false, { status: 'down', error: errorMessage }),
      );
    }
  }
}
