/**
 * Phase 7 Plan 03 Task 1: Cost breakdown chart component.
 *
 * Renders total cost stat + bar/pie chart of breakdown by key.
 */

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { CostBreakdownItem } from '../../types/analytics';

interface CostBreakdownProps {
  total: number;
  breakdown: CostBreakdownItem[];
}

export function CostBreakdown({ total, breakdown }: CostBreakdownProps) {
  const chartData = breakdown.map(item => ({
    name: item.key,
    cost: item.cost,
    tokens: item.tokens,
  }));

  return (
    <div className="cost-breakdown">
      <div className="cost-total">
        <h3>Total Cost</h3>
        <p className="cost-value">${total.toFixed(4)}</p>
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
            <YAxis stroke="#6b7280" fontSize={12} label={{ value: 'Cost ($)', angle: -90, position: 'insideLeft' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}
              labelStyle={{ color: '#111827', fontWeight: 600 }}
              formatter={(value: any) => `$${Number(value).toFixed(4)}`}
            />
            <Legend />
            <Bar dataKey="cost" fill="#3b82f6" name="Cost ($)" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="chart-empty">
          <p>No cost breakdown available</p>
        </div>
      )}
    </div>
  );
}
