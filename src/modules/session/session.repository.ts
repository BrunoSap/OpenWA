import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantScopedRepository } from '../../common/repositories/tenant-scoped-base.repository';
import { Session, SessionStatus } from './entities/session.entity';

/**
 * Repository for Session entity with automatic tenant scoping.
 *
 * All queries are automatically filtered by tenantId from ClsService,
 * preventing cross-tenant data leaks. Domain-specific methods inherit
 * tenant filtering from the base class.
 */
@Injectable()
export class SessionRepository extends TenantScopedRepository<Session> {
  constructor(
    cls: ClsService,
    @InjectRepository(Session, 'data') repo: Repository<Session>,
  ) {
    super(cls, repo);
  }

  /**
   * Finds session by name within current tenant scope.
   * Returns null if not found or belongs to different tenant.
   */
  async findByName(name: string): Promise<Session | null> {
    return this.findOne({ where: { name } });
  }

  /**
   * Finds all active (READY status) sessions within current tenant scope.
   * Used for session listing and availability checks.
   */
  async findActive(): Promise<Session[]> {
    return this.find({
      where: { status: SessionStatus.READY },
    });
  }

  /**
   * Finds sessions by status within current tenant scope.
   * Used for monitoring and health checks.
   */
  async findByStatus(status: SessionStatus): Promise<Session[]> {
    return this.find({
      where: { status },
    });
  }
}
