import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

/**
 * BillingService - Wraps Stripe customer and subscription operations
 * Phase 09 Plan 03: Stripe billing integration
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;

  constructor() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not set - Stripe operations will fail');
    }
    this.stripe = new Stripe(stripeSecretKey || 'sk_test_dummy', {
      apiVersion: '2025-09-30.clover',
    });
  }

  /**
   * Create a Stripe customer for a tenant
   *
   * @param tenantId - Tenant identifier (stored in customer metadata)
   * @param email - Customer email
   * @param name - Customer name
   * @returns Stripe customer ID
   */
  async createCustomer(tenantId: string, email: string, name: string): Promise<string> {
    const customer = await this.stripe.customers.create({
      email,
      name,
      metadata: {
        tenantId,
      },
    });
    this.logger.log(`Created Stripe customer ${customer.id} for tenant ${tenantId}`);
    return customer.id;
  }

  /**
   * Create a subscription for a customer
   *
   * @param customerId - Stripe customer ID
   * @param priceId - Stripe price ID
   * @param metadata - Additional metadata (plan name, etc)
   * @returns Stripe subscription object
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    metadata: { plan: string },
  ): Promise<Stripe.Subscription> {
    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata,
    });
    this.logger.log(`Created subscription ${subscription.id} for customer ${customerId}`);
    return subscription;
  }

  /**
   * Cancel a subscription
   *
   * @param subscriptionId - Stripe subscription ID
   */
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.cancel(subscriptionId);
    this.logger.log(`Canceled subscription ${subscriptionId}`);
  }

  /**
   * Get Stripe client instance (for advanced operations)
   */
  getStripeClient(): Stripe {
    return this.stripe;
  }
}
