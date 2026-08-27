import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';

    const module: TestingModule = await Test.createTestingModule({
      providers: [BillingService],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize Stripe client', () => {
    const stripeClient = service.getStripeClient();
    expect(stripeClient).toBeDefined();
  });

  describe('createCustomer', () => {
    it('should create a Stripe customer with metadata', async () => {
      const mockCreate = jest.fn().mockResolvedValue({ id: 'cus_test123' });
      jest.spyOn(service.getStripeClient().customers, 'create').mockImplementation(mockCreate);

      const customerId = await service.createCustomer('tenant-123', 'test@example.com', 'Test Tenant');

      expect(customerId).toBe('cus_test123');
      expect(mockCreate).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test Tenant',
        metadata: {
          tenantId: 'tenant-123',
        },
      });
    });
  });

  describe('createSubscription', () => {
    it('should create a subscription with metadata', async () => {
      const mockSubscription = { id: 'sub_test123', customer: 'cus_test123', status: 'active' };
      const mockCreate = jest.fn().mockResolvedValue(mockSubscription);
      jest.spyOn(service.getStripeClient().subscriptions, 'create').mockImplementation(mockCreate);

      const subscription = await service.createSubscription('cus_test123', 'price_test', { plan: 'pro' });

      expect(subscription.id).toBe('sub_test123');
      expect(mockCreate).toHaveBeenCalledWith({
        customer: 'cus_test123',
        items: [{ price: 'price_test' }],
        metadata: { plan: 'pro' },
      });
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel a subscription', async () => {
      const mockCancel = jest.fn().mockResolvedValue({ id: 'sub_test123', status: 'canceled' });
      jest.spyOn(service.getStripeClient().subscriptions, 'cancel').mockImplementation(mockCancel);

      await service.cancelSubscription('sub_test123');

      expect(mockCancel).toHaveBeenCalledWith('sub_test123');
    });
  });
});
