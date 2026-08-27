import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantRateLimitGuard } from './tenant-rate-limit.guard';
import { TenantService } from '../../modules/tenant/tenant.service';
import { RateLimiterService } from '../services/rate-limiter.service';
import { Tenant } from '../../modules/tenant/tenant.entity';

describe('TenantRateLimitGuard', () => {
  let guard: TenantRateLimitGuard;
  let mockClsService: jest.Mocked<ClsService>;
  let mockTenantService: jest.Mocked<TenantService>;
  let mockRateLimiter: jest.Mocked<RateLimiterService>;

  const mockExecutionContext = (tenantId?: string) => {
    const mockRequest = {};
    const mockResponse = {
      setHeader: jest.fn(),
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    mockClsService = {
      get: jest.fn(),
    } as any;

    mockTenantService = {
      findById: jest.fn(),
    } as any;

    mockRateLimiter = {
      checkLimit: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantRateLimitGuard,
        {
          provide: ClsService,
          useValue: mockClsService,
        },
        {
          provide: TenantService,
          useValue: mockTenantService,
        },
        {
          provide: RateLimiterService,
          useValue: mockRateLimiter,
        },
      ],
    }).compile();

    guard = module.get<TenantRateLimitGuard>(TenantRateLimitGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow request when under rate limit', async () => {
      const context = mockExecutionContext();
      mockClsService.get.mockReturnValue('tenant-123');
      mockTenantService.findById.mockResolvedValue({
        id: 'tenant-123',
        rateLimitPerMinute: 60,
      } as Tenant);
      mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true, remaining: 45 });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('tenant-123', 60, 60);

      const response = context.switchToHttp().getResponse();
      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
      expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '45');
    });

    it('should throw HttpException with 429 status when limit exceeded', async () => {
      const context = mockExecutionContext();
      mockClsService.get.mockReturnValue('tenant-123');
      mockTenantService.findById.mockResolvedValue({
        id: 'tenant-123',
        rateLimitPerMinute: 60,
      } as Tenant);
      mockRateLimiter.checkLimit.mockResolvedValue({ allowed: false, remaining: 0 });

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(error.getResponse()).toMatchObject({
          statusCode: 429,
          message: 'Rate limit exceeded',
        });
      }
    });

    it('should use default limit of 60 when tenant has no custom limit', async () => {
      const context = mockExecutionContext();
      mockClsService.get.mockReturnValue('tenant-123');
      mockTenantService.findById.mockResolvedValue({
        id: 'tenant-123',
        rateLimitPerMinute: null,
      } as any);
      mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true, remaining: 50 });

      await guard.canActivate(context);

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('tenant-123', 60, 60);
    });

    it('should use custom tenant rate limit when configured', async () => {
      const context = mockExecutionContext();
      mockClsService.get.mockReturnValue('tenant-123');
      mockTenantService.findById.mockResolvedValue({
        id: 'tenant-123',
        rateLimitPerMinute: 120,
      } as Tenant);
      mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true, remaining: 100 });

      await guard.canActivate(context);

      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('tenant-123', 120, 60);
    });

    it('should allow request when no tenant context (unauthenticated)', async () => {
      const context = mockExecutionContext();
      mockClsService.get.mockReturnValue(undefined);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockTenantService.findById).not.toHaveBeenCalled();
      expect(mockRateLimiter.checkLimit).not.toHaveBeenCalled();
    });

    it('should allow request when tenant not found (edge case)', async () => {
      const context = mockExecutionContext();
      mockClsService.get.mockReturnValue('tenant-123');
      mockTenantService.findById.mockResolvedValue(null);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRateLimiter.checkLimit).not.toHaveBeenCalled();
    });
  });

  describe('per-tenant isolation', () => {
    it('should enforce separate limits for different tenants', async () => {
      const context = mockExecutionContext();

      // Tenant A
      mockClsService.get.mockReturnValue('tenant-A');
      mockTenantService.findById.mockResolvedValue({
        id: 'tenant-A',
        rateLimitPerMinute: 10,
      } as Tenant);
      mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true, remaining: 5 });

      await guard.canActivate(context);
      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('tenant-A', 10, 60);

      // Tenant B
      mockClsService.get.mockReturnValue('tenant-B');
      mockTenantService.findById.mockResolvedValue({
        id: 'tenant-B',
        rateLimitPerMinute: 100,
      } as Tenant);
      mockRateLimiter.checkLimit.mockResolvedValue({ allowed: true, remaining: 90 });

      await guard.canActivate(context);
      expect(mockRateLimiter.checkLimit).toHaveBeenCalledWith('tenant-B', 100, 60);
    });
  });
});
