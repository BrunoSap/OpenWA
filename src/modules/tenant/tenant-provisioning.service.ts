import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Tenant } from './tenant.entity';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { OnboardingState } from '../onboarding/entities/onboarding-state.entity';
import { hashApiKey } from '../auth/api-key-hash';
import { SignupDto } from './dto/signup.dto';
import { ProvisioningResultDto } from './dto/provisioning-result.dto';
import { BillingService } from '../billing/billing.service';

/**
 * TenantProvisioningService - Handles self-service tenant signup and provisioning
 * Phase 09 Plan 04: Tenant onboarding automation
 *
 * Provisions tenant + admin API key + default session transactionally
 */
@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    @InjectDataSource('main')
    private readonly dataSource: DataSource,
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Provision a new tenant with admin API key and default session
   * All operations wrapped in a single transaction
   *
   * @param dto - Signup details (name, email, companyName, plan)
   * @returns Tenant entity, unhashed admin key (shown once), setup URL
   */
  async provisionTenant(dto: SignupDto): Promise<ProvisioningResultDto> {
    return this.dataSource.transaction(async (em) => {
      // 1. Slugify companyName and ensure uniqueness
      let slug = this.slugify(dto.companyName);
      const existingTenant = await em.findOne(Tenant, { where: { slug } });
      if (existingTenant) {
        // Append random suffix to avoid collision
        slug = `${slug}-${crypto.randomBytes(4).toString('hex')}`;
      }

      // 2. Create tenant
      const plan = dto.plan || 'free';
      const tenant = em.create(Tenant, {
        name: dto.companyName,
        slug,
        billingEmail: dto.email,
        plan,
        quotaMessages: this.getQuotaForPlan(plan),
        rateLimitPerMinute: this.getRateLimitForPlan(plan),
        isActive: true,
        stripeCustomerId: null, // Created async below
        stripeSubscriptionId: null,
        subscriptionStatus: 'active',
        paymentStatus: 'none',
        gracePeriodEndsAt: null,
        allowOverage: false,
      });
      await em.save(tenant);

      this.logger.log(`Created tenant ${tenant.id} (${tenant.slug}) for ${dto.email}`);

      // 3. Create Stripe customer async (fire-and-forget, non-blocking)
      void this.billingService
        .createCustomer(tenant.id, dto.email, dto.companyName)
        .then(async (customerId) => {
          // Update tenant with Stripe customer ID (outside transaction)
          await this.dataSource.manager.update(Tenant, tenant.id, { stripeCustomerId: customerId });
          this.logger.log(`Linked Stripe customer ${customerId} to tenant ${tenant.id}`);
        })
        .catch((err) => {
          this.logger.error(`Stripe customer creation failed for tenant ${tenant.id}`, err);
        });

      // 4. Generate admin API key
      const plainKey = `owa_k1_${crypto.randomBytes(32).toString('hex')}`;
      const keyHash = await hashApiKey(plainKey);
      const keyPrefix = plainKey.substring(0, 12);

      const apiKey = em.create(ApiKey, {
        tenantId: tenant.id,
        name: 'Admin Key (auto-generated)',
        keyHash,
        keyPrefix,
        role: ApiKeyRole.ADMIN,
        allowedIps: null,
        allowedSessions: null,
        isActive: true,
      });
      await em.save(apiKey);

      this.logger.log(`Generated admin API key ${apiKey.id} for tenant ${tenant.id}`);

      // 5. Create default session
      const session = em.create(Session, {
        tenantId: tenant.id,
        name: 'default',
        status: SessionStatus.CREATED,
        config: {
          autoReconnect: true,
          webhookUrl: null,
        },
      });
      await em.save(session);

      this.logger.log(`Created default session ${session.id} for tenant ${tenant.id}`);

      // 6. Initialize onboarding state
      const onboardingState = em.create(OnboardingState, {
        tenantId: tenant.id,
        currentStep: 'welcome',
        completedSteps: [],
        metadata: {},
      });
      await em.save(onboardingState);

      this.logger.log(`Initialized onboarding state for tenant ${tenant.id}`);

      // 7. Return provisioning result
      const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:2785';
      const setupUrl = `${baseUrl}/onboarding/${tenant.id}`;

      return {
        tenant,
        adminKey: plainKey,
        setupUrl,
      };
    });
  }

  /**
   * Slugify company name for URL-safe tenant slug
   * Lowercase, replace spaces with hyphens, remove special chars
   */
  private slugify(companyName: string): string {
    return companyName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Get message quota for a given plan tier
   */
  private getQuotaForPlan(plan: string): number {
    const quotas: Record<string, number> = {
      free: 100,
      starter: 1000,
      pro: 10000,
      enterprise: 100000,
    };
    return quotas[plan] || quotas.free;
  }

  /**
   * Get rate limit (requests per minute) for a given plan tier
   */
  private getRateLimitForPlan(plan: string): number {
    const limits: Record<string, number> = {
      free: 10,
      starter: 60,
      pro: 300,
      enterprise: 1000,
    };
    return limits[plan] || limits.free;
  }
}
