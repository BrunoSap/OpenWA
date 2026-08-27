import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Repository, FindManyOptions, FindOneOptions, DeepPartial, ObjectLiteral } from 'typeorm';

/**
 * Base repository that automatically scopes all queries to the current tenant.
 *
 * Every find/findOne/create/update/delete operation auto-injects tenantId from ClsService,
 * preventing cross-tenant data leaks at the application level.
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * export class SessionRepository extends TenantScopedRepository<Session> {
 *   constructor(
 *     cls: ClsService,
 *     @InjectRepository(Session) repo: Repository<Session>,
 *   ) {
 *     super(cls, repo);
 *   }
 *
 *   // Domain methods inherit tenant scoping automatically
 *   async findByName(name: string): Promise<Session | null> {
 *     return this.findOne({ where: { name } });
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class TenantScopedRepository<T extends ObjectLiteral> {
  constructor(
    protected readonly cls: ClsService,
    protected readonly repository: Repository<T>,
  ) {}

  /**
   * Reads tenantId from ClsService (set by ApiKeyGuard after authentication).
   * Throws UnauthorizedException if missing — guards against unauthenticated access.
   */
  protected getTenantId(): string {
    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) {
      throw new UnauthorizedException(
        'Tenant context missing. Ensure API key authentication succeeded before this call.',
      );
    }
    return tenantId;
  }

  /**
   * Finds multiple entities, automatically filtering by current tenant.
   * Merges tenantId into WHERE clause before query execution.
   */
  async find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find({
      ...options,
      where: {
        tenantId: this.getTenantId(),
        ...(options?.where || {}),
      } as any,
    });
  }

  /**
   * Finds a single entity, automatically filtering by current tenant.
   * Returns null if not found within tenant scope.
   */
  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne({
      ...options,
      where: {
        tenantId: this.getTenantId(),
        ...(options?.where || {}),
      } as any,
    });
  }

  /**
   * Finds entity by ID within current tenant scope.
   * Returns null if entity doesn't exist OR belongs to different tenant.
   */
  async findById(id: string): Promise<T | null> {
    return this.findOne({ where: { id } as any });
  }

  /**
   * Creates new entity with tenantId automatically stamped from context.
   * Prevents creating entities without tenant assignment.
   */
  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create({
      ...data,
      tenantId: this.getTenantId(),
    } as any);
    const saved = await this.repository.save(entity);
    return saved as unknown as T;
  }

  /**
   * Updates entity by ID, verifying it belongs to current tenant first.
   * Throws error if entity not found within tenant scope.
   */
  async update(id: string, data: DeepPartial<T>): Promise<T> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new Error(`Entity with id ${id} not found in current tenant scope`);
    }
    Object.assign(entity, data);
    const saved = await this.repository.save(entity);
    return saved as unknown as T;
  }

  /**
   * Deletes entity by ID, verifying it belongs to current tenant first.
   * Throws error if entity not found within tenant scope.
   */
  async delete(id: string): Promise<void> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new Error(`Entity with id ${id} not found in current tenant scope`);
    }
    await this.repository.remove(entity);
  }

  /**
   * ADMIN-ONLY: Queries ALL tenants without scoping filter.
   *
   * ⚠️ WARNING: Bypasses tenant isolation. Use ONLY in routes protected by:
   * - @RequireRole(ApiKeyRole.ADMIN)
   * - @RequireUnscopedKey()
   *
   * All calls to this method should be audited for security compliance.
   */
  async findAllTenants(options?: FindManyOptions<T>): Promise<T[]> {
    // No tenantId filter — use with caution, RequireRole ADMIN only
    return this.repository.find(options);
  }
}
