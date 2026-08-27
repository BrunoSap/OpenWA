import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Per-tenant rate limiting using Redis sliding window algorithm.
 *
 * Pattern from Phase 9 RESEARCH.md: sliding window prevents burst at window boundary.
 * Fixed window allows 119 requests in 1 second (59 at :59s, 60 at :00s).
 * Sliding window distributes uniformly over time.
 *
 * Redis key format: rate_limit:tenant:{tenantId}:{windowNum}
 * Each tenant gets isolated counters — tenant A exhausting limit does not affect tenant B.
 */
@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private redis: Redis | null = null;
  private readonly enabled: boolean;

  /**
   * Lua script for atomic sliding window rate limiting.
   * Executed in Redis to ensure atomicity (no race conditions).
   *
   * Algorithm:
   * 1. Get current time from Redis TIME command (microsecond precision)
   * 2. Calculate current and previous window numbers
   * 3. Estimate request count using weighted average: prev * (1-elapsed) + curr
   * 4. If estimate >= limit, deny request
   * 5. Otherwise increment current window counter and set TTL
   *
   * Returns: [allowed (0|1), remaining]
   */
  private readonly slidingWindowScript = `
    local base   = KEYS[1]
    local limit  = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])

    local t   = redis.call('TIME')
    local now = tonumber(t[1]) + tonumber(t[2]) / 1e6

    local window_num = math.floor(now / window)
    local elapsed     = (now % window) / window

    local curr_key = base .. ':' .. window_num
    local prev_key = base .. ':' .. (window_num - 1)

    local prev = tonumber(redis.call('GET', prev_key) or 0)
    local curr = tonumber(redis.call('GET', curr_key) or 0)

    local estimate = prev * (1 - elapsed) + curr

    if estimate >= limit then
        return {0, math.ceil(limit - estimate)}
    end

    local new_count = redis.call('INCR', curr_key)
    if new_count == 1 then
        redis.call('EXPIRE', curr_key, window * 2)
    end

    return {1, math.ceil(limit - estimate - 1)}
  `;

  constructor(private readonly configService: ConfigService) {
    this.enabled = process.env.REDIS_ENABLED === 'true' || configService.get<boolean>('cache.enabled', false);

    if (this.enabled) {
      this.ensureClient();
    }
  }

  /**
   * Lazily create the single shared Redis client for rate limiting.
   * Uses same connection strategy as CacheService.
   */
  private ensureClient(): void {
    if (this.redis) return;

    const host = process.env.REDIS_HOST || this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = parseInt(process.env.REDIS_PORT || '', 10) || this.configService.get<number>('REDIS_PORT', 6379);

    this.redis = new Redis({
      host,
      port,
      username: this.configService.get<string>('REDIS_USERNAME'),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_RATE_LIMIT_DB', 2), // Use DB 2 for rate limiting
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
      connectTimeout: this.configService.get<number>('redis.connectTimeoutMs', 5000),
      retryStrategy: times => Math.min(times * 500, 5000),
    });

    this.redis.connect().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * Check if request is allowed under tenant's rate limit.
   *
   * @param tenantId - Tenant identifier (from ClsService)
   * @param limit - Maximum requests allowed in window
   * @param windowSeconds - Time window in seconds (typically 60 for per-minute limits)
   * @returns { allowed: boolean, remaining: number } - Whether request is allowed and how many requests remain
   */
  async checkLimit(
    tenantId: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    // If Redis not enabled, allow all requests (fail-open)
    if (!this.enabled || !this.redis) {
      return { allowed: true, remaining: limit };
    }

    const key = `rate_limit:tenant:${tenantId}`;

    try {
      const result = (await this.redis.eval(
        this.slidingWindowScript,
        1,
        key,
        limit,
        windowSeconds,
      )) as [number, number];

      const [allowed, remaining] = result;

      return {
        allowed: Boolean(allowed),
        remaining: Math.max(0, remaining),
      };
    } catch (error) {
      // Fail-open on Redis error — don't block requests if rate limiter is down
      return { allowed: true, remaining: limit };
    }
  }
}
