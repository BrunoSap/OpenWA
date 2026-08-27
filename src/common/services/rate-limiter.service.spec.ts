import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from './rate-limiter.service';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis');

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let mockRedis: jest.Mocked<Redis>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockRedis = {
      eval: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
    } as any;

    (Redis as any).mockImplementation(() => mockRedis);

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'cache.enabled': true,
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          'REDIS_RATE_LIMIT_DB': 2,
          'redis.connectTimeoutMs': 5000,
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    // Set environment variable to enable Redis
    process.env.REDIS_ENABLED = 'true';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.REDIS_ENABLED;
  });

  describe('checkLimit', () => {
    it('should allow request when under limit', async () => {
      // Redis eval returns [1, 45] = allowed, 45 remaining
      mockRedis.eval.mockResolvedValue([1, 45]);

      const result = await service.checkLimit('tenant-123', 60, 60);

      expect(result).toEqual({ allowed: true, remaining: 45 });
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call'),
        1,
        'rate_limit:tenant:tenant-123',
        60,
        60,
      );
    });

    it('should deny request when limit exceeded', async () => {
      // Redis eval returns [0, -5] = denied, -5 remaining (over limit)
      mockRedis.eval.mockResolvedValue([0, -5]);

      const result = await service.checkLimit('tenant-123', 60, 60);

      expect(result).toEqual({ allowed: false, remaining: 0 });
    });

    it('should use tenant-specific key format', async () => {
      mockRedis.eval.mockResolvedValue([1, 10]);

      await service.checkLimit('tenant-ABC', 20, 60);

      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'rate_limit:tenant:tenant-ABC',
        20,
        60,
      );
    });

    it('should fail-open when Redis throws error', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.checkLimit('tenant-123', 60, 60);

      expect(result).toEqual({ allowed: true, remaining: 60 });
    });
  });

  describe('tenant isolation', () => {
    it('should use different keys for different tenants', async () => {
      mockRedis.eval.mockResolvedValue([1, 50]);

      await service.checkLimit('tenant-A', 60, 60);
      await service.checkLimit('tenant-B', 60, 60);

      expect(mockRedis.eval).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        1,
        'rate_limit:tenant:tenant-A',
        60,
        60,
      );

      expect(mockRedis.eval).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        1,
        'rate_limit:tenant:tenant-B',
        60,
        60,
      );
    });
  });

  describe('Redis disabled', () => {
    let disabledService: RateLimiterService;

    beforeEach(async () => {
      delete process.env.REDIS_ENABLED;

      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'cache.enabled': false, // Disabled
            REDIS_HOST: 'localhost',
            REDIS_PORT: 6379,
          };
          return config[key] ?? defaultValue;
        }),
      } as any;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RateLimiterService,
          {
            provide: ConfigService,
            useValue: disabledConfigService,
          },
        ],
      }).compile();

      disabledService = module.get<RateLimiterService>(RateLimiterService);
    });

    it('should fail-open when Redis is disabled', async () => {
      const result = await disabledService.checkLimit('tenant-123', 60, 60);

      expect(result).toEqual({ allowed: true, remaining: 60 });
      // Redis client should not even be created, so eval won't be called
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit Redis connection on destroy', async () => {
      await service.onModuleDestroy();

      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});
