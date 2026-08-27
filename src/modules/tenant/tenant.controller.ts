import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { RequireRole, RequireUnscopedKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
import { Tenant } from './tenant.entity';

/**
 * Tenant management controller
 * All routes require ADMIN role and unscoped API keys
 */
@ApiTags('tenants')
@Controller('api/tenants')
@RequireRole(ApiKeyRole.ADMIN)
@RequireUnscopedKey()
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  @ApiResponse({ status: 200, description: 'Tenant found', type: Tenant })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getTenant(@Param('id') id: string): Promise<Tenant | null> {
    return this.tenantService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new tenant (admin only)' })
  @ApiResponse({ status: 201, description: 'Tenant created', type: Tenant })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createTenant(@Body() dto: CreateTenantDto): Promise<Tenant> {
    return this.tenantService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update tenant (admin only)' })
  @ApiResponse({ status: 200, description: 'Tenant updated', type: Tenant })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<Tenant> {
    return this.tenantService.update(id, dto);
  }
}
