import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Tenant } from './tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { AuthService } from '../auth/auth.service';
import { ApiKey } from '../auth/entities/api-key.entity';
import { CreateApiKeyDto } from '../auth/dto';

/**
 * Service for managing tenants
 */
@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant, 'main')
    private readonly tenantRepository: Repository<Tenant>,
    private readonly cls: ClsService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
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
   * Create API key for a specific tenant.
   *
   * This method allows an ADMIN to create keys scoped to any tenant without being
   * authenticated as that tenant. It sets tenantId in CLS context temporarily,
   * then calls AuthService.createApiKey which reads from CLS.
   *
   * @param tenantId - The tenant to create the key for
   * @param dto - API key creation parameters (name, role, allowedIps, etc)
   * @returns The created API key entity and the raw unhashed key (show once)
   */
  async createApiKey(tenantId: string, dto: CreateApiKeyDto): Promise<{ key: string; apiKey: ApiKey }> {
    // Verify tenant exists
    const tenant = await this.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    // Run AuthService.createApiKey with tenantId set in CLS context
    // This pattern allows admin to create keys for any tenant without being authenticated as that tenant
    return await this.cls.run(async () => {
      this.cls.set('tenantId', tenantId);
      const result = await this.authService.createApiKey(dto);
      return {
        key: result.rawKey,
        apiKey: result.apiKey,
      };
    });
  }
}
