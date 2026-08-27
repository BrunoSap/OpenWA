/**
 * Phase 7 Plan 03 Task 1: Time series chart component (generic).
 *
 * Renders a line/area chart for time series data.
 */

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { TimeSeriesDataPoint } from '../../types/analytics';

interface TimeSeriesChartProps {
  data: TimeSeriesDataPoint[];
  color?: string;
  label?: string;
}

interface ChartDataPoint {
  label: string;
  value: number;
}

function prepareTimeSeriesData(data: TimeSeriesDataPoint[]): ChartDataPoint[] {
  return data.map(point => {
    const timestamp = point.timestamp;
    const label = timestamp.includes('T') && timestamp.slice(11, 13) !== '00'
      ? timestamp.slice(11, 16)
      : timestamp.slice(5, 10);

    return { label, value: point.value };
  });
}

export function TimeSeriesChart({ data, color = '#3b82f6', label = 'Value' }: TimeSeriesChartProps) {
  const chartData = prepareTimeSeriesData(data);

  if (chartData.length === 0) {
    return (
      <div className="chart-empty">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
        <YAxis stroke="#6b7280" fontSize={12} />
        <Tooltip
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px' }}
          labelStyle={{ color: '#111827', fontWeight: 600 }}
        />
        <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.2} name={label} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
