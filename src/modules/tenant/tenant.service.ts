import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

/**
 * Service for managing tenants
 */
@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant, 'main')
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  /**
   * Find tenant by ID
   */
  async findById(id: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { id } });
  }

  /**
   * Find tenant by slug
   */
  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { slug } });
  }

  /**
   * Create a new tenant
   */
  async create(dto: CreateTenantDto): Promise<Tenant> {
    const tenant = this.tenantRepository.create(dto);
    return this.tenantRepository.save(tenant);
  }

  /**
   * Update an existing tenant
   */
  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    Object.assign(tenant, dto);
    return this.tenantRepository.save(tenant);
  }

  /**
   * TODO: Implement in Phase 9 Plan 2
   * Create API key for a tenant
   */
  async createApiKey(tenantId: string): Promise<any> {
    throw new Error('Not implemented - deferred to Phase 9 Plan 2');
  }
}
