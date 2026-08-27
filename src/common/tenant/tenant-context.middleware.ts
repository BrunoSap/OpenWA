import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { LEGACY_TENANT_ID } from '../constants';
import { ApiKey } from '../../modules/auth/entities/api-key.entity';

/**
 * Middleware to extract tenantId from API key and inject into ClsService
 *
 * This middleware runs AFTER ApiKeyGuard, which populates request.apiKey.
 * It provides belt-and-suspenders tenant context injection for routes that
 * might bypass the guard.
 *
 * Note: The guard already sets tenantId in ClsService, so this middleware
 * primarily serves as a fallback and consistency check.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const request = req as Request & { apiKey?: ApiKey };

    // If API key exists (stamped by ApiKeyGuard), extract tenantId
    if (request.apiKey) {
      const tenantId = request.apiKey.tenantId || LEGACY_TENANT_ID;

      // Set tenantId in ClsService if not already set
      // Guard sets it first, this is belt-and-suspenders
      if (!this.cls.get('tenantId')) {
        this.cls.set('tenantId', tenantId);
      }
    }

    next();
  }
}
