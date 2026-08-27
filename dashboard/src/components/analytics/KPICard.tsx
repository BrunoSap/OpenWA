/**
 * Phase 7 Plan 02 Task 2: KPICard component (presentational).
 *
 * Renders a metric card with title, value, optional trend indicator, and icon.
 */

import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface KPICardProps {
  title: string;
  value: string | number;
  trend?: 'up' | 'down' | 'stable';
  icon?: LucideIcon;
}

export function KPICard({ title, value, trend, icon: Icon }: KPICardProps) {
  const trendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const TrendIcon = trendIcon;
  const trendColor =
    trend === 'up' ? 'var(--success, #10b981)' : trend === 'down' ? 'var(--error, #ef4444)' : 'var(--text-secondary)';

  return (
    <div
      style={{
        background: 'var(--card-bg, #fff)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: '8px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3
          style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            margin: 0,
          }}
        >
          {title}
        </h3>
        {Icon && <Icon size={20} style={{ color: 'var(--text-tertiary)' }} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <div
          style={{
            fontSize: '1.875rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {value}
        </div>
        {trend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: trendColor }}>
            <TrendIcon size={16} />
          </div>
        )}
      </div>
    </div>
  );
}
