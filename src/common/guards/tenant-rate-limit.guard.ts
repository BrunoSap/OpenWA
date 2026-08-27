import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantService } from '../../modules/tenant/tenant.service';
import { RateLimiterService } from '../services/rate-limiter.service';

/**
 * Guard that enforces per-tenant rate limiting.
 *
 * Runs after ApiKeyGuard (which sets tenantId in ClsService).
 * Reads tenant's rateLimitPerMinute from database, checks Redis counter,
 * and either allows request or throws 429 Too Many Requests.
 *
 * Response headers added:
 * - X-RateLimit-Limit: Maximum requests per minute
 * - X-RateLimit-Remaining: Requests remaining in current window
 */
@Injectable()
export class TenantRateLimitGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly tenantService: TenantService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Get tenantId from ClsService (set by ApiKeyGuard)
    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) {
      // No tenant context — likely unauthenticated request or public route
      // Let it pass (ApiKeyGuard already denied if auth was required)
      return true;
    }

    // Fetch tenant to get rate limit configuration
    const tenant = await this.tenantService.findById(tenantId);
    if (!tenant) {
      // Tenant not found — should not happen (ApiKeyGuard validated the key)
      // Let it pass to avoid blocking valid requests
      return true;
    }

    const limit = tenant.rateLimitPerMinute ?? 60; // Default: 60 requests per minute
    const result = await this.rateLimiter.checkLimit(tenantId, limit, 60);

    // Set rate limit headers for client visibility
    response.setHeader('X-RateLimit-Limit', limit.toString());
    response.setHeader('X-RateLimit-Remaining', result.remaining.toString());

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          retryAfter: 60,
          limit,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
