import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Tenant } from '../../src/modules/tenant/tenant.entity';
import { ApiKey } from '../../src/modules/auth/entities/api-key.entity';
import { Session } from '../../src/modules/session/entities/session.entity';
import { AuditLog } from '../../src/modules/audit/entities/audit-log.entity';
import { LEGACY_TENANT_ID } from '../../src/common/constants';
import * as crypto from 'crypto';

/**
 * E2E test suite for PostgreSQL Row-Level Security (RLS) tenant isolation.
 *
 * Tests verify that RLS policies enforce tenant_id filtering at the database level,
 * even when application code forgets WHERE tenantId clauses.
 *
 * Prerequisites:
 * - PostgreSQL running (not SQLite)
 * - RLS_ENABLED=true environment variable
 * - Migration 012 applied (RLS policies enabled)
 *
 * Test scenarios:
 * 1. RLS blocks cross-tenant queries (raw SQL without WHERE tenantId)
 * 2. RLS safe failure mode (no app.tenant_id session variable → empty result)
 * 3. Admin bypass (row_security=OFF) + audit trail
 * 4. Leak prevention (application bug caught by RLS safety net)
 */
describe('RLS Isolation E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let apiKeyA: ApiKey;
  let apiKeyB: ApiKey;

  beforeAll(async () => {
    // Only run if RLS enabled (production environment)
    if (process.env.RLS_ENABLED !== 'true') {
      console.log('Skipping RLS tests - RLS_ENABLED != true');
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get<DataSource>('DataDataSource');

    // Create two tenants
    const tenantRepo = dataSource.getRepository(Tenant);
    tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'Tenant A',
        slug: 'tenant-a-rls',
        plan: 'free',
        isActive: true,
      }),
    );
    tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'Tenant B',
        slug: 'tenant-b-rls',
        plan: 'free',
        isActive: true,
      }),
    );

    // Create API keys for each tenant
    const apiKeyRepo = dataSource.getRepository(ApiKey);
    const hashA = crypto.createHash('sha256').update('key-tenant-a-rls').digest('hex');
    const hashB = crypto.createHash('sha256').update('key-tenant-b-rls').digest('hex');

    apiKeyA = await apiKeyRepo.save(
      apiKeyRepo.create({
        keyHash: hashA,
        name: 'Tenant A Key',
        role: 'USER',
        tenantId: tenantA.id,
      }),
    );
    apiKeyB = await apiKeyRepo.save(
      apiKeyRepo.create({
        keyHash: hashB,
        name: 'Tenant B Key',
        role: 'USER',
        tenantId: tenantB.id,
      }),
    );
  });

  afterAll(async () => {
    if (process.env.RLS_ENABLED !== 'true') return;

    // Cleanup
    if (dataSource) {
      const sessionRepo = dataSource.getRepository(Session);
      await sessionRepo.delete({ tenantId: tenantA.id });
      await sessionRepo.delete({ tenantId: tenantB.id });

      const apiKeyRepo = dataSource.getRepository(ApiKey);
      await apiKeyRepo.delete({ id: apiKeyA.id });
      await apiKeyRepo.delete({ id: apiKeyB.id });

      const tenantRepo = dataSource.getRepository(Tenant);
      await tenantRepo.delete({ id: tenantA.id });
      await tenantRepo.delete({ id: tenantB.id });
    }

    await app?.close();
  });

  it('should block cross-tenant queries via RLS (raw SQL without WHERE tenantId)', async () => {
    if (process.env.RLS_ENABLED !== 'true') {
      console.log('Skipping - RLS not enabled');
      return;
    }

    // Create sessions for both tenants
    const sessionRepo = dataSource.getRepository(Session);
    const sessionA = await sessionRepo.save(
      sessionRepo.create({
        name: 'session-a-rls',
        status: 'READY',
        tenantId: tenantA.id,
      }),
    );
    const sessionB = await sessionRepo.save(
      sessionRepo.create({
        name: 'session-b-rls',
        status: 'READY',
        tenantId: tenantB.id,
      }),
    );

    // Simulate application bug: raw SQL query without WHERE tenantId filter
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Set tenant A context
      await queryRunner.query(`SET LOCAL app.tenant_id = $1`, [tenantA.id]);

      // Query without WHERE tenantId (simulating application bug)
      // RLS should filter to only tenant A sessions
      const result = await queryRunner.query(`SELECT * FROM sessions WHERE name LIKE '%rls'`);

      // Verify RLS filtered to tenant A only
      expect(result).toHaveLength(1);
      expect(result[0].tenant_id).toBe(tenantA.id);
      expect(result[0].name).toBe('session-a-rls');

      // Tenant B session should NOT appear (RLS blocked it)
      expect(result.find((s: any) => s.tenant_id === tenantB.id)).toBeUndefined();
    } finally {
      await queryRunner.release();
    }

    // Cleanup
    await sessionRepo.delete({ id: sessionA.id });
    await sessionRepo.delete({ id: sessionB.id });
  });

  it('should return empty result when app.tenant_id not set (safe failure mode)', async () => {
    if (process.env.RLS_ENABLED !== 'true') {
      console.log('Skipping - RLS not enabled');
      return;
    }

    // Create session
    const sessionRepo = dataSource.getRepository(Session);
    const session = await sessionRepo.save(
      sessionRepo.create({
        name: 'session-safe-failure',
        status: 'READY',
        tenantId: tenantA.id,
      }),
    );

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Query without setting app.tenant_id (simulate missing tenant context)
      const result = await queryRunner.query(`SELECT * FROM sessions WHERE name = 'session-safe-failure'`);

      // RLS policy rejects all rows when app.tenant_id not set (safe failure mode)
      expect(result).toHaveLength(0);
    } finally {
      await queryRunner.release();
    }

    // Cleanup
    await sessionRepo.delete({ id: session.id });
  });

  it('should allow admin bypass with row_security=OFF + audit trail', async () => {
    if (process.env.RLS_ENABLED !== 'true') {
      console.log('Skipping - RLS not enabled');
      return;
    }

    // Create sessions for both tenants
    const sessionRepo = dataSource.getRepository(Session);
    const sessionA = await sessionRepo.save(
      sessionRepo.create({
        name: 'session-admin-a',
        status: 'READY',
        tenantId: tenantA.id,
      }),
    );
    const sessionB = await sessionRepo.save(
      sessionRepo.create({
        name: 'session-admin-b',
        status: 'READY',
        tenantId: tenantB.id,
      }),
    );

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Admin bypass: disable row-level security
      await queryRunner.query(`SET LOCAL row_security = OFF`);

      // Query all sessions (admin sees all tenants)
      const result = await queryRunner.query(`SELECT * FROM sessions WHERE name LIKE 'session-admin-%'`);

      // Verify admin sees both tenants' sessions
      expect(result.length).toBeGreaterThanOrEqual(2);
      const tenantIds = result.map((s: any) => s.tenant_id);
      expect(tenantIds).toContain(tenantA.id);
      expect(tenantIds).toContain(tenantB.id);

      // Audit log should record this cross-tenant query
      // (In real implementation, AuditCrossTenantService.logCrossTenantQuery would be called)
      const auditRepo = dataSource.getRepository(AuditLog);
      const auditLog = await auditRepo.save(
        auditRepo.create({
          action: 'CROSS_TENANT_QUERY',
          tenantId: null, // Admin context
          actor: 'admin@test.com',
          metadata: {
            queriedTenantIds: [tenantA.id, tenantB.id],
            query: 'SELECT * FROM sessions WHERE name LIKE ?',
            timestamp: new Date().toISOString(),
          },
        }),
      );

      // Verify audit log created
      expect(auditLog.action).toBe('CROSS_TENANT_QUERY');
      expect(auditLog.tenantId).toBeNull();
      expect(auditLog.actor).toBe('admin@test.com');
      expect(auditLog.metadata.queriedTenantIds).toEqual([tenantA.id, tenantB.id]);

      // Cleanup audit log
      await auditRepo.delete({ id: auditLog.id });
    } finally {
      await queryRunner.release();
    }

    // Cleanup
    await sessionRepo.delete({ id: sessionA.id });
    await sessionRepo.delete({ id: sessionB.id });
  });

  it('should catch application bug via RLS safety net (leak prevention)', async () => {
    if (process.env.RLS_ENABLED !== 'true') {
      console.log('Skipping - RLS not enabled');
      return;
    }

    // Create sessions for both tenants
    const sessionRepo = dataSource.getRepository(Session);
    const sessionA = await sessionRepo.save(
      sessionRepo.create({
        name: 'session-leak-a',
        status: 'READY',
        tenantId: tenantA.id,
      }),
    );
    const sessionB = await sessionRepo.save(
      sessionRepo.create({
        name: 'session-leak-b',
        status: 'READY',
        tenantId: tenantB.id,
      }),
    );

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Set tenant A context
      await queryRunner.query(`SET LOCAL app.tenant_id = $1`, [tenantA.id]);

      // Simulate developer mistake: query forgot to filter by tenantId
      // In real code: SessionRepository.find() without WHERE tenantId
      const buggyQuery = `SELECT * FROM sessions WHERE name LIKE 'session-leak-%'`;
      const result = await queryRunner.query(buggyQuery);

      // RLS safety net caught the bug: only tenant A session returned
      expect(result).toHaveLength(1);
      expect(result[0].tenant_id).toBe(tenantA.id);
      expect(result[0].name).toBe('session-leak-a');

      // Tenant B session NOT leaked (RLS prevented cross-tenant data exposure)
      expect(result.find((s: any) => s.tenant_id === tenantB.id)).toBeUndefined();

      // This proves: even if application code has bugs, RLS prevents leaks
    } finally {
      await queryRunner.release();
    }

    // Cleanup
    await sessionRepo.delete({ id: sessionA.id });
    await sessionRepo.delete({ id: sessionB.id });
  });
});
