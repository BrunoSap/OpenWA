// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { applyGlobalValidation } from '../src/config/app-validation';
import { Tenant } from '../src/modules/tenant/tenant.entity';
import { ApiKey } from '../src/modules/auth/entities/api-key.entity';
import { Session } from '../src/modules/session/entities/session.entity';
import { AuditLog, AuditAction } from '../src/modules/audit/entities/audit-log.entity';
import { LEGACY_TENANT_ID } from '../src/common/constants';

/**
 * End-to-end proof of single-tenant isolation: tenantId propagation from API key → ClsService → session creation → audit trail
 *
 * Phase 9 Plan 1 scope:
 * - Tenant context propagation works (API key → ClsService)
 * - Session.tenantId is stamped correctly
 * - Audit logs include tenantId
 *
 * NOT tested in Plan 1 (deferred to Plan 2):
 * - Query filtering by tenant (repositories still return all rows)
 * - Cross-tenant isolation at query level
 */
describe('Tenant isolation E2E (Phase 9 Plan 1)', () => {
  let app: INestApplication<App>;
  let tenantRepo: Repository<Tenant>;
  let apiKeyRepo: Repository<ApiKey>;
  let sessionRepo: Repository<Session>;
  let auditRepo: Repository<AuditLog>;

  let tenantA: Tenant;
  let tenantB: Tenant;
  let apiKeyARaw: string; // API key for tenant A (manually created with tenantId)
  let apiKeyBRaw: string; // API key for tenant B

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    tenantRepo = app.get(getRepositoryToken(Tenant, 'main'));
    apiKeyRepo = app.get(getRepositoryToken(ApiKey, 'main'));
    sessionRepo = app.get(getRepositoryToken(Session, 'data'));
    auditRepo = app.get(getRepositoryToken(AuditLog, 'main'));

    // Create two tenants
    tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: `E2E Tenant A ${Date.now()}`,
        slug: `e2e-tenant-a-${Date.now()}`,
        plan: 'free',
      }),
    );

    tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: `E2E Tenant B ${Date.now()}`,
        slug: `e2e-tenant-b-${Date.now()}`,
        plan: 'free',
      }),
    );

    // Manually create API keys with tenantId (TenantService.createApiKey not yet implemented in Plan 1)
    const crypto = await import('crypto');
    const rawKeyA = `owtest_${crypto.randomBytes(24).toString('hex')}`;
    const rawKeyB = `owtest_${crypto.randomBytes(24).toString('hex')}`;
    const hashKeyA = crypto.createHash('sha256').update(rawKeyA).digest('hex');
    const hashKeyB = crypto.createHash('sha256').update(rawKeyB).digest('hex');

    await apiKeyRepo.save(
      apiKeyRepo.create({
        name: 'e2e-tenant-a-key',
        keyHash: hashKeyA,
        keyPrefix: rawKeyA.substring(0, 12),
        role: 'operator',
        tenantId: tenantA.id,
        isActive: true,
      }),
    );

    await apiKeyRepo.save(
      apiKeyRepo.create({
        name: 'e2e-tenant-b-key',
        keyHash: hashKeyB,
        keyPrefix: rawKeyB.substring(0, 12),
        role: 'operator',
        tenantId: tenantB.id,
        isActive: true,
      }),
    );

    apiKeyARaw = rawKeyA;
    apiKeyBRaw = rawKeyB;
  });

  afterAll(async () => {
    // Clean up test data
    if (tenantA) await tenantRepo.delete(tenantA.id);
    if (tenantB) await tenantRepo.delete(tenantB.id);

    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  describe('Single-tenant session creation with tenantId', () => {
    it('should create session with correct tenantId when using tenant A key', async () => {
      const sessionName = `e2e-session-a-${Date.now()}`;

      // Create session using tenant A's API key
      const res = await request(app.getHttpServer())
        .post(`/api/sessions/${sessionName}/start`)
        .set('X-API-Key', apiKeyARaw)
        .send({})
        .expect(201);

      expect(res.body).toHaveProperty('id');
      const sessionId = res.body.id;

      // Verify session has tenantId stamped
      const session = await sessionRepo.findOne({ where: { id: sessionId } });
      expect(session).toBeDefined();
      expect(session!.tenantId).toBe(tenantA.id);
    });

    it('should create session with correct tenantId when using tenant B key', async () => {
      const sessionName = `e2e-session-b-${Date.now()}`;

      // Create session using tenant B's API key
      const res = await request(app.getHttpServer())
        .post(`/api/sessions/${sessionName}/start`)
        .set('X-API-Key', apiKeyBRaw)
        .send({})
        .expect(201);

      expect(res.body).toHaveProperty('id');
      const sessionId = res.body.id;

      // Verify session has tenantId stamped
      const session = await sessionRepo.findOne({ where: { id: sessionId } });
      expect(session).toBeDefined();
      expect(session!.tenantId).toBe(tenantB.id);
    });
  });

  describe('Audit trail with tenantId attribution', () => {
    it('should stamp tenantId in audit logs for tenant A operations', async () => {
      const sessionName = `e2e-audit-a-${Date.now()}`;

      // Create session (triggers audit log)
      await request(app.getHttpServer())
        .post(`/api/sessions/${sessionName}/start`)
        .set('X-API-Key', apiKeyARaw)
        .send({})
        .expect(201);

      // Query audit logs for this session creation
      const auditLogs = await auditRepo.find({
        where: {
          action: AuditAction.SESSION_CREATED,
          sessionName,
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const log = auditLogs[0];
      expect(log.tenantId).toBe(tenantA.id);
    });

    it('should stamp tenantId in audit logs for tenant B operations', async () => {
      const sessionName = `e2e-audit-b-${Date.now()}`;

      // Create session (triggers audit log)
      await request(app.getHttpServer())
        .post(`/api/sessions/${sessionName}/start`)
        .set('X-API-Key', apiKeyBRaw)
        .send({})
        .expect(201);

      // Query audit logs for this session creation
      const auditLogs = await auditRepo.find({
        where: {
          action: AuditAction.SESSION_CREATED,
          sessionName,
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const log = auditLogs[0];
      expect(log.tenantId).toBe(tenantB.id);
    });
  });

  describe('Cross-tenant query isolation (Plan 1: NOT enforced - documented gap)', () => {
    // TODO: Uncomment after Plan 2 implements TenantScopedRepository with query filtering
    it.skip('should NOT see tenant B sessions when querying with tenant A key', async () => {
      // This test documents the EXPECTED behavior after Plan 2
      // Plan 1 does NOT enforce query filtering - repositories return all sessions

      const res = await request(app.getHttpServer())
        .get('/api/sessions')
        .set('X-API-Key', apiKeyARaw)
        .expect(200);

      const sessions = res.body as Session[];
      const tenantBSessions = sessions.filter(s => s.tenantId === tenantB.id);

      // After Plan 2, this assertion should pass (tenant A cannot see tenant B sessions)
      expect(tenantBSessions).toHaveLength(0);
    });
  });

  describe('Legacy tenant fallback', () => {
    it('should use LEGACY_TENANT_ID for API keys without tenantId', async () => {
      const crypto = await import('crypto');
      const rawKeyLegacy = `owtest_${crypto.randomBytes(24).toString('hex')}`;
      const hashKeyLegacy = crypto.createHash('sha256').update(rawKeyLegacy).digest('hex');

      // Create API key WITHOUT tenantId
      await apiKeyRepo.save(
        apiKeyRepo.create({
          name: 'e2e-legacy-key',
          keyHash: hashKeyLegacy,
          keyPrefix: rawKeyLegacy.substring(0, 12),
          role: 'operator',
          tenantId: null, // No tenant assigned
          isActive: true,
        }),
      );

      const sessionName = `e2e-session-legacy-${Date.now()}`;

      // Create session using legacy key
      const res = await request(app.getHttpServer())
        .post(`/api/sessions/${sessionName}/start`)
        .set('X-API-Key', rawKeyLegacy)
        .send({})
        .expect(201);

      const sessionId = res.body.id;

      // Verify session has LEGACY_TENANT_ID
      const session = await sessionRepo.findOne({ where: { id: sessionId } });
      expect(session).toBeDefined();
      expect(session!.tenantId).toBe(LEGACY_TENANT_ID);

      // Verify audit log also has LEGACY_TENANT_ID
      const auditLogs = await auditRepo.find({
        where: {
          action: AuditAction.SESSION_CREATED,
          sessionName,
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      expect(auditLogs[0].tenantId).toBe(LEGACY_TENANT_ID);
    });
  });
});
