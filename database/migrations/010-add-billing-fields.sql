-- Migration 010: Add billing fields to tenants table
-- Phase 09 Plan 03: Stripe billing integration
-- Adds subscription status, payment status, grace period, and overage settings

BEGIN;

-- Add billing-related columns to tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS allow_overage BOOLEAN DEFAULT false;

-- Add index on subscription_status for filtering subscriptions by status
CREATE INDEX IF NOT EXISTS IDX_tenants_subscription_status ON tenants(subscription_status);

-- Add index on grace_period_ends_at for scheduled downgrade jobs
CREATE INDEX IF NOT EXISTS IDX_tenants_grace_period ON tenants(grace_period_ends_at)
  WHERE grace_period_ends_at IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN tenants.subscription_status IS 'Stripe subscription status: none, active, past_due, canceled, etc';
COMMENT ON COLUMN tenants.payment_status IS 'Payment status: none, paid, failed, requires_action';
COMMENT ON COLUMN tenants.grace_period_ends_at IS 'Timestamp when grace period expires and tenant should be downgraded';
COMMENT ON COLUMN tenants.allow_overage IS 'Whether tenant can exceed quota (usage-based billing)';

COMMIT;
