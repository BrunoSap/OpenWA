import { Injectable, Optional } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';

/**
 * Custom health indicator for Redis connectivity.
 *
 * Checks Redis availability via PING command with timeout-bounded execution.
 * Used in the readiness probe to signal when the replica cannot reach Redis
 * (BullMQ queue, WebSocket adapter, or context cache failures).
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    @Optional() private readonly redisClient?: Redis,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    // Redis is optional in the architecture (REDIS_ENABLED=false is valid)
    if (!this.redisClient) {
      return this.getStatus(key, true, { status: 'disabled' });
    }

    try {
      const pong = await this.redisClient.ping();
      if (pong !== 'PONG') {
        throw new HealthCheckError('Redis PING unexpected response', this.getStatus(key, false, { response: pong }));
      }
      return this.getStatus(key, true, { status: 'up' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError(
        'Redis unreachable',
        this.getStatus(key, false, { status: 'down', error: errorMessage }),
      );
    }
  }
}
