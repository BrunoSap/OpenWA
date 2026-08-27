/**
 * Phase 7 Plan 03 Task 1: Percentile chart component.
 *
 * Renders p50/p95/p99 latency lines over time using Recharts.
 */

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { PercentileDataPoint } from '../../types/analytics.ts';
import { preparePercentileData } from '../../utils/preparePercentileData.ts';

interface PercentileChartProps {
  data: PercentileDataPoint[];
}

export function PercentileChart({ data }: PercentileChartProps) {
  const chartData = preparePercentileData(data);

  if (chartData.length === 0) {
    return (
      <div className="chart-empty">
        <p>No performance data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft' }} />
        <Tooltip
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}
          labelStyle={{ color: '#111827', fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ paddingTop: '10px' }} />
        <Line type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2} name="p50" dot={false} />
        <Line type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={2} name="p95" dot={false} />
        <Line type="monotone" dataKey="p99" stroke="#ef4444" strokeWidth={2} name="p99" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
