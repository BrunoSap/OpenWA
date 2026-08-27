import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Tenant } from '../../src/modules/tenant/tenant.entity';
import { Session } from '../../src/modules/session/entities/session.entity';
import { AuditCrossTenantService } from '../../src/modules/audit/audit-cross-tenant.service';
import { AuditLog } from '../../src/modules/audit/entities/audit-log.entity';

/**
 * E2E test suite for cross-tenant admin query audit logging.
 *
 * Tests verify that admin cross-tenant queries are logged to audit_logs
 * for forensic review and abuse detection.
 *
 * Prerequisites:
 * - PostgreSQL running (not SQLite)
 * - AuditCrossTenantService registered in AuditModule
 *
 * Test scenarios:
 * 1. Admin cross-tenant query logged with queriedTenantIds
 * 2. Audit log format correct (action, tenantId=null, metadata)
 * 3. Multiple queries create separate audit entries
 */
describe('Cross-Tenant Audit E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let auditService: AuditCrossTenantService;
  let tenantA: Tenant;
  let tenantB: Tenant;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get<DataSource>('DataDataSource');
    auditService = app.get<AuditCrossTenantService>(AuditCrossTenantService);

    // Create two tenants
    const tenantRepo = dataSource.getRepository(Tenant);
    tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'Tenant A Audit',
        slug: 'tenant-a-audit',
        plan: 'free',
        isActive: true,
      }),
    );
    tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'Tenant B Audit',
        slug: 'tenant-b-audit',
        plan: 'free',
        isActive: true,
      }),
    );
  });

  afterAll(async () => {
    if (dataSource) {
      const tenantRepo = dataSource.getRepository(Tenant);
      await tenantRepo.delete({ id: tenantA.id });
      await tenantRepo.delete({ id: tenantB.id });
    }

    await app?.close();
  });

  it('should log admin cross-tenant query with queriedTenantIds', async () => {
    // Admin performs cross-tenant query
    await auditService.logCrossTenantQuery(
      'admin@example.com',
      [tenantA.id, tenantB.id],
      'SELECT * FROM sessions WHERE tenant_id IN (?, ?)',
    );

    // Verify audit log created
    const auditRepo = dataSource.getRepository(AuditLog);
    const auditLogs = await auditRepo.find({
      where: {
        action: 'CROSS_TENANT_QUERY',
        actor: 'admin@example.com',
      },
      order: { createdAt: 'DESC' },
      take: 1,
    });

    expect(auditLogs).toHaveLength(1);
    const log = auditLogs[0];

    // Verify audit log format
    expect(log.action).toBe('CROSS_TENANT_QUERY');
    expect(log.tenantId).toBeNull(); // Admin context, not scoped to any tenant
    expect(log.actor).toBe('admin@example.com');
    expect(log.metadata).toBeDefined();
    expect(log.metadata.adminUser).toBe('admin@example.com');
    expect(log.metadata.queriedTenantIds).toEqual([tenantA.id, tenantB.id]);
    expect(log.metadata.query).toBe('SELECT * FROM sessions WHERE tenant_id IN (?, ?)');
    expect(log.metadata.timestamp).toBeDefined();

    // Cleanup
    await auditRepo.delete({ id: log.id });
  });

  it('should create separate audit entries for multiple queries', async () => {
    // Admin performs two different cross-tenant queries
    await auditService.logCrossTenantQuery(
      'admin@example.com',
      [tenantA.id],
      'SELECT * FROM sessions WHERE tenant_id = ?',
    );

    await auditService.logCrossTenantQuery(
      'admin@example.com',
      [tenantB.id],
      'SELECT * FROM messages WHERE tenant_id = ?',
    );

    // Verify two separate audit logs created
    const auditRepo = dataSource.getRepository(AuditLog);
    const auditLogs = await auditRepo.find({
      where: {
        action: 'CROSS_TENANT_QUERY',
        actor: 'admin@example.com',
      },
      order: { createdAt: 'DESC' },
      take: 2,
    });

    expect(auditLogs.length).toBeGreaterThanOrEqual(2);

    // Verify each log is distinct
    const log1 = auditLogs[0];
    const log2 = auditLogs[1];

    expect(log1.metadata.query).not.toBe(log2.metadata.query);
    expect(log1.metadata.queriedTenantIds).not.toEqual(log2.metadata.queriedTenantIds);

    // Cleanup
    await auditRepo.delete({ id: log1.id });
    await auditRepo.delete({ id: log2.id });
  });

  it('should allow filtering audit logs by actor for forensic review', async () => {
    // Two admins perform cross-tenant queries
    await auditService.logCrossTenantQuery(
      'admin1@example.com',
      [tenantA.id],
      'SELECT * FROM sessions',
    );

    await auditService.logCrossTenantQuery(
      'admin2@example.com',
      [tenantB.id],
      'SELECT * FROM messages',
    );

    // Operator reviews audit logs for specific admin
    const auditRepo = dataSource.getRepository(AuditLog);
    const admin1Logs = await auditRepo.find({
      where: {
        action: 'CROSS_TENANT_QUERY',
        actor: 'admin1@example.com',
      },
    });

    const admin2Logs = await auditRepo.find({
      where: {
        action: 'CROSS_TENANT_QUERY',
        actor: 'admin2@example.com',
      },
    });

    // Verify filtering works
    expect(admin1Logs.length).toBeGreaterThanOrEqual(1);
    expect(admin2Logs.length).toBeGreaterThanOrEqual(1);
    expect(admin1Logs[0].actor).toBe('admin1@example.com');
    expect(admin2Logs[0].actor).toBe('admin2@example.com');

    // Cleanup
    for (const log of admin1Logs) {
      await auditRepo.delete({ id: log.id });
    }
    for (const log of admin2Logs) {
      await auditRepo.delete({ id: log.id });
    }
  });
});
