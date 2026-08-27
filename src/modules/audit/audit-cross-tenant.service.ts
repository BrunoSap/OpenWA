import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from './entities/audit-log.entity';

/**
 * AuditCrossTenantService logs admin cross-tenant queries for forensic review.
 *
 * Purpose: When admin executes queries with row_security=OFF (bypassing RLS),
 * log who accessed what tenant's data when. This creates a forensic trail for
 * security audits and abuse detection.
 *
 * Usage:
 * ```typescript
 * // Admin queries tenant A's sessions while authenticated as admin (no tenant scope)
 * await queryRunner.query(`SET LOCAL row_security = OFF`);
 * const sessions = await queryRunner.query(`SELECT * FROM sessions WHERE tenant_id = $1`, [tenantA.id]);
 * await this.auditCrossTenantService.logCrossTenantQuery(
 *   'admin@example.com',
 *   [tenantA.id],
 *   'SELECT * FROM sessions WHERE tenant_id = ?'
 * );
 * ```
 *
 * Audit log entry format:
 * - action: 'CROSS_TENANT_QUERY'
 * - tenant_id: null (admin operates outside tenant scope)
 * - metadata: { adminUser, queriedTenantIds, query, timestamp }
 * - actor: adminUser email/ID
 *
 * Security: ALL cross-tenant queries must be logged. Operators review audit_logs
 * regularly to detect unauthorized access patterns.
 */
@Injectable()
export class AuditCrossTenantService {
  constructor(
    @InjectRepository(AuditLog, 'main')
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Logs a cross-tenant admin query to the audit trail.
   *
   * @param adminUser - Admin user identifier (email, ID, or username)
   * @param queriedTenantIds - Array of tenant IDs accessed in the query
   * @param query - SQL query executed (sanitized, no sensitive data)
   */
  async logCrossTenantQuery(
    adminUser: string,
    queriedTenantIds: string[],
    query: string,
  ): Promise<void> {
    const auditLog = this.auditLogRepository.create({
      action: 'CROSS_TENANT_QUERY' as AuditAction,
      tenantId: null, // Admin context, not scoped to any tenant
      actor: adminUser,
      metadata: {
        adminUser,
        queriedTenantIds,
        query,
        timestamp: new Date().toISOString(),
      },
    });

    await this.auditLogRepository.save(auditLog);
  }
}
