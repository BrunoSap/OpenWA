-- Migration 011: Add onboarding state tracking
-- Phase 09 Plan 04: Tenant onboarding automation
-- Tracks wizard progression (welcome, whatsapp, test-message, complete)

-- Create onboarding_states table
CREATE TABLE IF NOT EXISTS onboarding_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  current_step VARCHAR(50) NOT NULL,
  completed_steps JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on tenant_id for fast lookup
CREATE INDEX IF NOT EXISTS idx_onboarding_states_tenant_id ON onboarding_states(tenant_id);

-- Add comment
COMMENT ON TABLE onboarding_states IS 'Phase 09 Plan 04: Tracks tenant onboarding wizard progression';
COMMENT ON COLUMN onboarding_states.current_step IS 'Current wizard step (welcome, whatsapp, test-message, complete)';
COMMENT ON COLUMN onboarding_states.completed_steps IS 'Array of completed step IDs';
COMMENT ON COLUMN onboarding_states.metadata IS 'Additional state data (timestamps, validation results, etc)';
