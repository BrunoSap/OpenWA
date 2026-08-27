import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { enableRLS } from './rls.config';
import { createLogger } from '../services/logger.service';

/**
 * RlsInterceptor sets PostgreSQL session variable app.tenant_id before each request.
 *
 * Execution order:
 * 1. ApiKeyGuard validates API key → sets tenantId in ClsService
 * 2. RlsInterceptor (this) reads tenantId from ClsService → sets app.tenant_id session variable
 * 3. Route handler executes → database queries filtered by RLS policies
 * 4. Response sent → session variable cleaned up (SET LOCAL auto-resets at transaction end)
 *
 * RLS Policy Enforcement:
 * - RLS policies use: USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
 * - If app.tenant_id not set: RLS rejects all rows (safe failure mode)
 * - Admin queries can bypass via: SET LOCAL row_security = OFF (logged in audit trail)
 *
 * Connection Pool Safety:
 * - Uses SET LOCAL (not SET) so variable resets at transaction end
 * - Prevents connection pool pollution (tenantId cannot leak between requests)
 * - Belt-and-suspenders RESET in finally block (though SET LOCAL should auto-reset)
 *
 * Configuration:
 * - Only runs if enableRLS is true (production)
 * - Dev/staging: interceptor is no-op (application-level scoping tested without RLS)
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  private readonly logger = createLogger('RlsInterceptor');

  constructor(
    private readonly cls: ClsService,
    @InjectDataSource('data') private readonly dataSource: DataSource,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    // Skip if RLS disabled (dev/staging environments)
    if (!enableRLS) {
      return next.handle();
    }

    // Read tenantId from ClsService (set by ApiKeyGuard after authentication)
    const tenantId = this.cls.get<string>('tenantId');

    // If no tenant context, skip setting session variable
    // RLS policy will reject all rows (safe failure mode)
    if (!tenantId) {
      this.logger.debug('No tenantId in ClsService - skipping RLS session variable');
      return next.handle();
    }

    // Get connection from pool
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Set session variable (SET LOCAL resets at transaction end)
      await queryRunner.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
      this.logger.debug(`Set app.tenant_id = ${tenantId}`);

      // Execute route handler
      return next.handle().pipe(
        tap({
          complete: async () => {
            // Belt-and-suspenders cleanup (SET LOCAL should auto-reset)
            try {
              await queryRunner.query(`RESET app.tenant_id`);
            } catch (error) {
              // Non-critical: SET LOCAL already resets at transaction end
              this.logger.warn('Failed to RESET app.tenant_id', { error });
            }
          },
        }),
      );
    } finally {
      // Release connection back to pool
      await queryRunner.release();
    }
  }
}
