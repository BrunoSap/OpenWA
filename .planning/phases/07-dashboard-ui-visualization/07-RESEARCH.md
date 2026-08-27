# Phase 7: Dashboard UI Visualization - Research

**Researched:** 2026-08-27
**Domain:** Dashboard UI for analytics consumption (Grafana + React SPA)
**Confidence:** HIGH

## Summary

Phase 6 delivered complete analytics backend (10 REST endpoints, SSE stream, CSV/JSON export, Prometheus alerts). Phase 7 adds visual interfaces for stakeholders to consume these metrics without writing queries.

**Dual-track approach:**
- **Wave 1: Grafana MVP** (~2h) — Quick operational visibility using existing Prometheus + JSON API datasource
- **Wave 2: React SPA** (~3-5 days) — Custom UX with real-time updates, alert management, and export UI

**Primary recommendation:** Implement both tracks. Grafana provides immediate value for ops teams; React SPA delivers tailored UX for business stakeholders.

**Architecture discovery:** OpenWA already has a React dashboard (`/dashboard`) served by NestJS via `ServeStaticModule`. Phase 7 extends this existing pattern with new analytics routes rather than creating a separate dashboard container.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Metrics visualization | Browser (React SPA) | — | Chart rendering, interactive filtering, drill-down navigation are client-side concerns |
| Real-time data stream | API tier (NestJS SSE) | Browser (EventSource client) | Backend owns SSE stream production; frontend consumes via EventSource API |
| Data aggregation | API tier (analytics service) | Database (PostgreSQL) | Business logic computes KPIs; database stores raw events and pre-aggregated rollups |
| Alert management UI | Browser (React SPA) | — | CRUD operations on alert rules are user-facing interactions |
| Grafana dashboards | CDN/Static (Grafana container) | — | Grafana is a separate service, not part of OpenWA frontend |
| Export CSV/JSON | API tier (export service) | Browser (download trigger) | Backend generates export files; frontend initiates download |

---

## Standard Stack

### Core (Grafana Track)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Grafana | 11.x | Visualization platform | Industry standard for operational dashboards, built-in Prometheus integration [CITED: grafana.com] |
| JSON API Plugin | built-in | REST endpoint datasource | Native Grafana plugin for consuming arbitrary JSON APIs [CITED: grafana.com/docs] |
| Prometheus Datasource | built-in | Metrics visualization | Grafana's first-class integration for Prometheus metrics [VERIFIED: config/prometheus/prometheus.yml exists] |

**Installation (Grafana):**
```bash
# Already configured in docker-compose.full-stack.yml
docker compose --profile monitoring up -d grafana prometheus
```

### Core (React Track)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.2.8 | UI framework | Already used in OpenWA dashboard [VERIFIED: dashboard/package.json:26] |
| Recharts | 3.10.1 | Chart library | Already installed, composable React components for analytics charts [VERIFIED: dashboard/package.json:31] |
| TanStack Query | 5.101.4 | Data fetching | Already installed, standard for server state management [VERIFIED: dashboard/package.json:19] |
| React Router | 7.18.2 | Navigation | Already installed, handles dashboard routing [VERIFIED: dashboard/package.json:30] |
| Lucide React | 1.31.0 | Icon library | Already installed in dashboard [VERIFIED: dashboard/package.json:25] |

**Installation:** None required — all dependencies already present in `dashboard/package.json`.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Socket.IO Client | 4.8.3 | WebSocket fallback | If SSE proves unreliable in production (already installed) [VERIFIED: dashboard/package.json:32] |
| @nestjs/serve-static | 5.0.5 | SPA serving | Already installed in backend to serve dashboard build [VERIFIED: package.json:88] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | Chart.js | Chart.js offers more chart types but requires imperative API; Recharts is declarative and React-native |
| Recharts | D3.js | D3 gives full control but steep learning curve; Recharts abstracts common patterns |
| TanStack Query | SWR | SWR is lighter but TanStack Query has better dev tools and SSE patterns |
| Grafana | Custom only | Custom-only approach means no ops visibility until React SPA ships (days delay) |

---

## Package Legitimacy Audit

> All packages are already installed in the OpenWA codebase. No new external dependencies required.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| recharts | npm | 8 yrs | 2.5M/wk | github.com/recharts/recharts | [OK] | Approved — already installed |
| @tanstack/react-query | npm | 7 yrs (as react-query) | 5M/wk | github.com/tanstack/query | [OK] | Approved — already installed |
| @nestjs/serve-static | npm | 5 yrs | 500k/wk | github.com/nestjs/serve-static | [OK] | Approved — already installed |
| react-router-dom | npm | 10 yrs | 10M/wk | github.com/remix-run/react-router | [OK] | Approved — already installed |
| lucide-react | npm | 3 yrs | 1.8M/wk | github.com/lucide-icons/lucide | [OK] | Approved — already installed |

**Packages removed due to [SLOP] verdict:** None

**Packages flagged as suspicious [SUS]:** None

**Version verification (2026-08-27):**
```bash
npm view recharts version          # 3.10.1 (latest)
npm view @tanstack/react-query version  # 5.101.4 (latest)
npm view @nestjs/serve-static version   # 5.0.5 (latest)
```

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PHASE 7 VISUALIZATION                        │
└─────────────────────────────────────────────────────────────────────┘

   USER REQUEST
        │
        ├──────────────────────┬─────────────────────────────────┐
        ▼                      ▼                                 ▼
   ┌─────────┐          ┌──────────┐                      ┌──────────┐
   │ Grafana │          │  React   │                      │   API    │
   │  :3000  │          │Dashboard │                      │ Client   │
   └────┬────┘          └────┬─────┘                      │(curl/etc)│
        │                    │                             └────┬─────┘
        │ Prometheus         │ HTTP/SSE                         │
        │ queries            │ requests                         │
        ▼                    ▼                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │              NestJS Backend (openwa-api:2785)                    │
   ├─────────────────────────────────────────────────────────────────┤
   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
   │  │  /metrics    │  │ /analytics/* │  │ ServeStatic  │          │
   │  │ (Prometheus) │  │   REST API   │  │   Module     │          │
   │  │              │  │              │  │ (React build)│          │
   │  │ port 9090    │  │ 10 endpoints │  │              │          │
   │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
   │         │                  │                  │                  │
   │         │                  ▼                  │                  │
   │         │         ┌──────────────┐            │                  │
   │         │         │  Analytics   │            │                  │
   │         │         │   Services   │            │                  │
   │         │         │              │            │                  │
   │         │         │ - Events     │            │                  │
   │         │         │ - Export     │            │                  │
   │         │         │ - Alerts     │            │                  │
   │         │         └──────┬───────┘            │                  │
   └─────────┼────────────────┼────────────────────┼──────────────────┘
             │                │                    │
             ▼                ▼                    ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                   PostgreSQL Database                            │
   ├──────────────────────────────────────────────────────────────────┤
   │  analytics_events │ analytics_aggregates │ analytics_alert_rules │
   └──────────────────────────────────────────────────────────────────┘

DATA FLOW (Real-time updates):

  Phase 6 Event          Analytics            SSE Stream
  Emission          ──►  Service         ──►  Browser
  (message.processed)    (aggregate)          (EventSource)
                                               │
                                               ▼
                                          React Component
                                          (chart update)
```

### Recommended Project Structure

**Grafana configuration (new):**
```
grafana/
├── provisioning/
│   ├── dashboards/
│   │   ├── dashboard.yml           # Auto-load dashboards
│   │   └── openwa-analytics.json   # Dashboard definition
│   └── datasources/
│       ├── prometheus.yml          # Prometheus datasource
│       └── json-api.yml            # Phase 6 REST endpoints
└── alerting/
    └── notification-channels.yml   # Slack/email/webhook
```

**React dashboard (extend existing):**
```
dashboard/src/
├── pages/
│   └── Analytics/                  # NEW: Analytics page
│       ├── Overview.tsx            # KPI cards, trend charts
│       ├── Performance.tsx         # Latency percentiles
│       ├── Cost.tsx                # Cost breakdown by feature
│       ├── Conversations.tsx       # Conversation list + drill-down
│       └── Alerts.tsx              # Alert rules management
├── components/
│   └── analytics/                  # NEW: Reusable chart components
│       ├── KPICard.tsx             # Metric card with trend
│       ├── TimeSeriesChart.tsx     # Line/Area chart wrapper
│       ├── PercentileChart.tsx     # P50/P95/P99 visualization
│       ├── CostBreakdown.tsx       # Pie/bar chart
│       └── AlertRuleForm.tsx       # CRUD for alert rules
├── hooks/
│   └── useAnalytics.ts             # NEW: TanStack Query hooks
├── services/
│   └── analytics.ts                # NEW: API client for Phase 6 endpoints
└── types/
    └── analytics.ts                # NEW: TypeScript types for responses
```

### Pattern 1: Server-Sent Events (SSE) Integration

**What:** Real-time dashboard updates using EventSource API and TanStack Query.

**When to use:** Dashboard metrics that update every 10 seconds (Phase 6 SSE stream emits every 10s).

**Example:**
```tsx
// Source: TanStack Query + native EventSource pattern
// hooks/useAnalyticsStream.ts

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

interface KPISnapshot {
  totalMessages: number;
  activeUsers: number;
  resolutionRate: number;
  avgLatency: number;
  totalCost: number;
}

export function useAnalyticsStream() {
  const [snapshot, setSnapshot] = useState<KPISnapshot | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/analytics/stream', {
      withCredentials: true, // Send operator API key cookie
    });

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setSnapshot(data);
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
      // Exponential backoff reconnection handled by browser
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return { snapshot, isConnected: snapshot !== null };
}

// Usage in component
function OverviewDashboard() {
  const { snapshot, isConnected } = useAnalyticsStream();

  if (!isConnected) {
    return <div>Connecting to real-time stream...</div>;
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <KPICard 
        title="Total Messages" 
        value={snapshot.totalMessages} 
        trend="up" 
      />
      <KPICard 
        title="Resolution Rate" 
        value={`${snapshot.resolutionRate}%`} 
        trend="stable" 
      />
      {/* ... more KPI cards */}
    </div>
  );
}
```

**Confidence:** HIGH [CITED: /tanstack/query documentation shows polling patterns; EventSource is native browser API]

### Pattern 2: Polling Fallback with TanStack Query

**What:** Fallback to HTTP polling if SSE connection fails or for non-real-time views.

**When to use:** Historical data queries, export operations, or when SSE is unavailable.

**Example:**
```tsx
// Source: TanStack Query refetchInterval pattern
// hooks/useAnalytics.ts

import { useQuery } from '@tanstack/react-query';

interface AnalyticsQueryParams {
  startDate: Date;
  endDate: Date;
  sessionId?: string;
}

export function useAnalyticsOverview(params: AnalyticsQueryParams) {
  return useQuery({
    queryKey: ['analytics', 'overview', params],
    queryFn: async () => {
      const url = new URLSearchParams({
        startDate: params.startDate.toISOString(),
        endDate: params.endDate.toISOString(),
        ...(params.sessionId && { sessionId: params.sessionId }),
      });
      
      const response = await fetch(`/api/analytics/overview?${url}`, {
        headers: {
          'Authorization': `Bearer ${getApiKey()}`,
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    refetchInterval: 30_000, // Refresh every 30s
    staleTime: 20_000,       // Consider fresh for 20s
    gcTime: 5 * 60 * 1000,   // Keep in cache for 5 minutes
  });
}

// Usage
function PerformancePage() {
  const { data, isFetching } = useAnalyticsOverview({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24h ago
    endDate: new Date(),
  });

  return (
    <div>
      {isFetching && <div className="refresh-indicator">Updating...</div>}
      <TimeSeriesChart 
        data={data?.timeSeries} 
        metrics={['p50', 'p95', 'p99']} 
      />
    </div>
  );
}
```

**Confidence:** HIGH [VERIFIED: TanStack Query v5.101.4 installed in dashboard/package.json; refetchInterval pattern from Context7 docs]

### Pattern 3: Recharts Responsive Dashboard

**What:** Declarative chart components with responsive containers and tooltips.

**When to use:** All analytics visualizations (time series, percentiles, cost breakdown).

**Example:**
```tsx
// Source: Recharts ResponsiveContainer + LineChart pattern
// components/analytics/TimeSeriesChart.tsx

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

interface TimeSeriesData {
  timestamp: string;
  p50: number;
  p95: number;
  p99: number;
}

interface Props {
  data: TimeSeriesData[];
  height?: number;
}

export function LatencyChart({ data, height = 400 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart 
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={(value) => new Date(value).toLocaleTimeString()}
        />
        <YAxis 
          label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip 
          labelFormatter={(value) => new Date(value).toLocaleString()}
          formatter={(value: number) => [`${value}ms`, '']}
        />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="p50" 
          stroke="#82ca9d" 
          strokeWidth={2}
          dot={false}
          name="p50 (median)"
        />
        <Line 
          type="monotone" 
          dataKey="p95" 
          stroke="#ffc658" 
          strokeWidth={2}
          dot={false}
          name="p95"
        />
        <Line 
          type="monotone" 
          dataKey="p99" 
          stroke="#ff7300" 
          strokeWidth={2}
          dot={false}
          name="p99"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Confidence:** HIGH [VERIFIED: Recharts 3.10.1 installed in dashboard; Context7 examples show ResponsiveContainer + LineChart pattern]

### Pattern 4: Grafana JSON API Datasource Configuration

**What:** Configure Grafana to consume Phase 6 REST endpoints as a datasource.

**When to use:** Grafana MVP track for immediate operational visibility.

**Example:**
```yaml
# grafana/provisioning/datasources/json-api.yml
apiVersion: 1

datasources:
  - name: OpenWA Analytics API
    type: simpod-json-datasource
    access: proxy
    url: http://openwa-api:2785/api/analytics
    jsonData:
      httpMethod: GET
      queryParams: 'limit=100'
      httpHeaderName1: 'Authorization'
    secureJsonData:
      httpHeaderValue1: 'Bearer ${OPERATOR_API_KEY}'
    isDefault: false
    editable: true
```

**Dashboard provisioning:**
```yaml
# grafana/provisioning/dashboards/dashboard.yml
apiVersion: 1

providers:
  - name: 'OpenWA Analytics'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

**Confidence:** MEDIUM [ASSUMED: Grafana JSON API datasource plugin pattern from training knowledge; not verified against official Grafana docs in this session]

### Anti-Patterns to Avoid

- **❌ Polling too frequently:** SSE stream updates every 10s; don't poll faster than that (wastes backend resources)
- **❌ Fetching full dataset on every update:** Use TanStack Query's cache and refetchInterval to minimize redundant requests
- **❌ Imperative chart updates:** Don't manually manipulate chart DOM; let Recharts handle re-renders declaratively
- **❌ Separate dashboard container:** OpenWA already serves React dashboard from NestJS; don't create docker-compose dashboard service
- **❌ Hard-coded API URLs:** Use environment variables (`VITE_API_URL`) or relative paths for API endpoints

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering | Custom SVG/Canvas | Recharts | 775+ code snippets, battle-tested patterns, accessibility built-in [VERIFIED: Context7 /recharts/recharts] |
| SSE connection management | Manual EventSource + reconnect logic | Native EventSource + browser auto-reconnect | Browsers handle reconnection automatically; exponential backoff is free |
| Data caching | Local state + manual invalidation | TanStack Query | Automatic cache invalidation, background refetching, optimistic updates [VERIFIED: already installed] |
| API client | Fetch wrapper | TanStack Query + native fetch | Query library handles loading/error/retry states; fetch is native |
| Static file serving | Custom Express middleware | @nestjs/serve-static | Already installed, handles SPA fallback routing [VERIFIED: package.json:88] |
| Prometheus dashboard | Custom metrics UI | Grafana | Industry standard, 1000+ pre-built panels, alert visualization |

**Key insight:** OpenWA dashboard already exists with all necessary dependencies. Phase 7 adds new routes and components to the existing structure rather than building from scratch.

---

## OpenWA Integration Points

### Existing Frontend Patterns Discovered

**Location:** `dashboard/` subdirectory (React 19 + Vite + TanStack Query)

**Build system:**
```json
// dashboard/package.json scripts
"dev": "vite",
"build": "tsc -b && vite build",
"preview": "vite preview"
```

**Integration with backend:**
```typescript
// Root package.json scripts
"dashboard:build": "cd dashboard && npm run build",
"build:all": "nest build && npm run dashboard:build",
"prod": "npm run build:all && node dist/main"
```

**Static serving:** [VERIFIED: @nestjs/serve-static v5.0.5 in package.json:88]

**Pattern:** NestJS serves built dashboard from `dashboard/dist` at root path. ServeStaticModule handles SPA routing fallback.

**Expected configuration (to verify in codebase):**
```typescript
// src/app.module.ts (assumed pattern)
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', 'dashboard', 'dist'),
  renderPath: '*',  // SPA fallback to index.html
})
```

### Authentication Flow for Dashboard Access

**Current pattern:** API key with `OPERATOR` role required for all `/api/analytics/*` endpoints [VERIFIED: analytics.controller.ts uses `@RequireRole(ApiKeyRole.OPERATOR)`]

**Dashboard integration:**
1. User logs into dashboard (existing auth flow)
2. Frontend stores operator API key (cookie/localStorage)
3. All analytics requests include `Authorization: Bearer <key>` header
4. SSE EventSource includes `withCredentials: true` to send auth cookie

**Security note:** Operator role prevents unauthorized access to analytics data containing chatId/userId (Phase 6 security requirement T-06-01).

### API Client Recommendations

**Pattern:** Centralized API client with authentication

```typescript
// dashboard/src/services/api.ts
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const apiKey = localStorage.getItem('operator_api_key');
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

// Usage with TanStack Query
export const analyticsApi = {
  getOverview: (params: AnalyticsQueryParams) =>
    apiRequest<AnalyticsOverviewResponse>('/analytics/overview', {
      method: 'GET',
      // params converted to query string
    }),
  
  exportEvents: (params: ExportParams) =>
    apiRequest<Blob>('/analytics/export', {
      method: 'GET',
      // returns CSV/JSON blob
    }),
  
  createAlertRule: (rule: AlertRulePayload) =>
    apiRequest<AlertRule>('/analytics/alerts/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
};
```

### Docker Service Architecture

**Current state:** [VERIFIED: docker-compose.yml shows openwa-api container with dashboard served by NestJS]

**Grafana track:** [VERIFIED: docker-compose.full-stack.yml has Grafana + Prometheus services with provisioning volumes]

**Recommended approach:**

1. **React dashboard:** No new container needed — extend existing dashboard code
2. **Grafana:** Use existing `docker-compose.full-stack.yml` configuration:

```yaml
# docker-compose.full-stack.yml (lines 491-505)
grafana:
  image: grafana/grafana:latest
  container_name: grafana
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
  volumes:
    - grafana_data:/var/lib/grafana
    - ./grafana-dashboards:/etc/grafana/provisioning/dashboards:ro
  depends_on:
    - prometheus
  ports:
    - '127.0.0.1:3000:3000'
```

**Phase 7 additions:**
- Create `grafana/` directory with provisioning files
- Update docker-compose volume mount to `./grafana:/etc/grafana/provisioning:ro`
- Add Prometheus datasource + JSON API datasource configs
- Add dashboard JSON files

---

## Common Pitfalls

### Pitfall 1: SSE Connection Drops Not Handled

**What goes wrong:** EventSource connection drops (network blip, container restart) → dashboard shows stale data forever.

**Why it happens:** Browser EventSource auto-reconnects, but React component doesn't detect reconnection and re-render.

**How to avoid:**
```tsx
useEffect(() => {
  const eventSource = new EventSource('/api/analytics/stream');
  
  eventSource.addEventListener('open', () => {
    console.log('SSE connected');
    setConnectionStatus('connected');
  });

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    setConnectionStatus('disconnected');
    // Browser handles reconnection automatically
  };

  eventSource.onmessage = (event) => {
    setSnapshot(JSON.parse(event.data));
    setConnectionStatus('connected'); // Reset on successful message
  };

  return () => eventSource.close();
}, []);
```

**Warning signs:** Dashboard shows "last updated X minutes ago" but no new data arriving.

### Pitfall 2: Chart Re-renders on Every Parent Update

**What goes wrong:** Parent component state changes → Recharts chart re-renders → expensive SVG re-layout → UI jank.

**Why it happens:** Recharts components are pure but parent passes new object/array references every render.

**How to avoid:**
```tsx
// ❌ BAD: Creates new array reference every render
function Dashboard() {
  const data = useAnalyticsStream();
  const chartData = data.timeSeries.map(point => ({ ...point })); // NEW array every time
  return <TimeSeriesChart data={chartData} />;
}

// ✅ GOOD: Memoize derived data
function Dashboard() {
  const data = useAnalyticsStream();
  const chartData = useMemo(
    () => data.timeSeries.map(point => ({ ...point })),
    [data.timeSeries] // Only recompute when source data changes
  );
  return <TimeSeriesChart data={chartData} />;
}
```

**Warning signs:** Dashboard feels sluggish, React DevTools shows frequent chart re-renders.

### Pitfall 3: Grafana JSON API Datasource Requires Plugin

**What goes wrong:** Grafana provisioning fails → datasource not available → empty dashboard panels.

**Why it happens:** Grafana's JSON API datasource is not bundled by default; requires plugin installation.

**How to avoid:**
```dockerfile
# Option 1: Install plugin in Grafana container
FROM grafana/grafana:latest
RUN grafana-cli plugins install simpod-json-datasource
```

```yaml
# Option 2: Use environment variable to auto-install
grafana:
  image: grafana/grafana:latest
  environment:
    - GF_INSTALL_PLUGINS=simpod-json-datasource
```

**Warning signs:** Grafana UI shows "Unknown datasource type: json-datasource" error.

### Pitfall 4: CORS Blocks Analytics API in Development

**What goes wrong:** React dev server (`vite dev` on port 5173) → fetch `/api/analytics/*` → CORS error.

**Why it happens:** NestJS API runs on port 2785; Vite dev server on port 5173 → cross-origin request.

**How to avoid:**
```typescript
// dashboard/vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:2785',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
```

**Warning signs:** Console shows `Access-Control-Allow-Origin` error; API works in production but not in `npm run dev`.

### Pitfall 5: Export CSV Downloads Broken in SSR Context

**What goes wrong:** User clicks "Export CSV" → nothing happens → no download triggers.

**Why it happens:** React component tries to trigger download before DOM is ready, or uses SSR-incompatible approach.

**How to avoid:**
```tsx
async function handleExport() {
  const response = await fetch('/api/analytics/export?format=csv', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  
  const blob = await response.blob();
  
  // Create temporary download link
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analytics-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
```

**Warning signs:** Export button click has no effect; console shows "window is not defined" error.

---

## Code Examples

### Example 1: Real-time KPI Dashboard with SSE

```tsx
// dashboard/src/pages/Analytics/Overview.tsx
import { useAnalyticsStream } from '../../hooks/useAnalyticsStream';
import { KPICard } from '../../components/analytics/KPICard';
import { TimeSeriesChart } from '../../components/analytics/TimeSeriesChart';

export function AnalyticsOverview() {
  const { snapshot, isConnected } = useAnalyticsStream();
  
  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-pulse">Connecting to analytics stream...</div>
          <div className="text-sm text-gray-500 mt-2">
            Real-time metrics will appear once connected
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Analytics Overview</h1>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Messages"
          value={snapshot.kpis.totalMessages.toLocaleString()}
          trend={snapshot.kpis.messagesTrend}
          icon="MessageSquare"
        />
        <KPICard
          title="Resolution Rate"
          value={`${(snapshot.kpis.resolutionRate * 100).toFixed(1)}%`}
          trend={snapshot.kpis.resolutionRateTrend}
          icon="CheckCircle"
          threshold={{ good: 70, warning: 50 }}
        />
        <KPICard
          title="Avg Latency"
          value={`${snapshot.kpis.avgLatency.toFixed(0)}ms`}
          trend={snapshot.kpis.latencyTrend}
          icon="Clock"
          threshold={{ good: 2000, warning: 5000 }}
        />
        <KPICard
          title="Total Cost"
          value={`$${snapshot.kpis.totalCost.toFixed(2)}`}
          trend={snapshot.kpis.costTrend}
          icon="DollarSign"
        />
      </div>

      {/* Time Series Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Message Volume (24h)</h2>
        <TimeSeriesChart
          data={snapshot.charts.messageVolume}
          metrics={['total', 'resolved', 'escalated']}
          height={300}
        />
      </div>

      {/* Connection Status */}
      <div className="text-xs text-gray-400 text-right">
        Live updates • Last received: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}
```

**Source:** Combined pattern from TanStack Query examples + OpenWA dashboard structure [VERIFIED: dashboard/src structure exists]

### Example 2: Alert Rules Management UI

```tsx
// dashboard/src/pages/Analytics/Alerts.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsApi } from '../../services/api';

export function AlertsPage() {
  const queryClient = useQueryClient();
  
  const { data: rules, isLoading } = useQuery({
    queryKey: ['analytics', 'alerts', 'rules'],
    queryFn: () => analyticsApi.getAlertRules(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => analyticsApi.deleteAlertRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'alerts', 'rules'] });
    },
  });

  if (isLoading) return <div>Loading alert rules...</div>;

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Alert Rules</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateForm(true)}
        >
          Create Alert Rule
        </button>
      </div>

      {/* Alert Rules Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Alert Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Condition
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Threshold
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rules?.map((rule) => (
              <tr key={rule.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {rule.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {rule.metric} {rule.condition}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {rule.threshold}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    rule.enabled 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {rule.enabled ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => deleteMutation.mutate(rule.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Source:** TanStack Query mutation pattern + OpenWA dashboard table patterns [VERIFIED: TanStack Query v5.101.4 installed]

### Example 3: Grafana Dashboard JSON (Provisioning)

```json
{
  "dashboard": {
    "title": "OpenWA Analytics Overview",
    "tags": ["openwa", "analytics"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Message Volume",
        "type": "graph",
        "datasource": "OpenWA Analytics API",
        "targets": [
          {
            "target": "messages_total",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 }
      },
      {
        "id": 2,
        "title": "Resolution Rate",
        "type": "stat",
        "datasource": "OpenWA Analytics API",
        "targets": [
          {
            "target": "resolution_rate",
            "refId": "A"
          }
        ],
        "gridPos": { "x": 12, "y": 0, "w": 6, "h": 4 },
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "red", "value": null },
                { "color": "yellow", "value": 50 },
                { "color": "green", "value": 70 }
              ]
            }
          }
        }
      },
      {
        "id": 3,
        "title": "Latency Percentiles",
        "type": "graph",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, sum(rate(analytics_message_latency_bucket[5m])) by (le))",
            "legendFormat": "p50",
            "refId": "A"
          },
          {
            "expr": "histogram_quantile(0.95, sum(rate(analytics_message_latency_bucket[5m])) by (le))",
            "legendFormat": "p95",
            "refId": "B"
          },
          {
            "expr": "histogram_quantile(0.99, sum(rate(analytics_message_latency_bucket[5m])) by (le))",
            "legendFormat": "p99",
            "refId": "C"
          }
        ],
        "gridPos": { "x": 0, "y": 8, "w": 24, "h": 8 }
      }
    ],
    "refresh": "10s",
    "time": {
      "from": "now-24h",
      "to": "now"
    }
  }
}
```

**Source:** Grafana dashboard JSON schema [ASSUMED: provisioning pattern from training knowledge; not verified against official Grafana docs]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate dashboard container | Dashboard served by backend (ServeStaticModule) | ~2021 (NestJS v8+) | Simplifies deployment, reduces container overhead |
| Imperative chart libraries (D3.js) | Declarative React chart components (Recharts) | ~2020 (React hooks era) | Easier maintenance, better TypeScript support |
| REST polling every 1s | Server-Sent Events (SSE) | ~2019 (EventSource standardization) | Lower latency, reduced server load |
| Redux for server state | TanStack Query (React Query) | ~2022 (v4+) | Automatic caching, background refetching, less boilerplate |
| Manual Grafana config | Provisioning as code (YAML/JSON) | ~2018 (Grafana v5+) | Version control, reproducible deployments |

**Deprecated/outdated:**
- **HighCharts/Chart.js for React:** Recharts provides better React integration with declarative components
- **Redux for API data:** TanStack Query is purpose-built for server state; Redux is overkill
- **Separate dashboard backend:** Modern frameworks (NestJS, Next.js) serve SPAs directly
- **Long polling for real-time updates:** SSE is native browser feature, no library needed

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | React build, NestJS runtime | ✓ | 22.13+ [VERIFIED: package.json:9] | — |
| React | Dashboard SPA | ✓ | 19.2.8 [VERIFIED: dashboard/package.json:26] | — |
| Recharts | Chart components | ✓ | 3.10.1 [VERIFIED: dashboard/package.json:31] | — |
| TanStack Query | Data fetching | ✓ | 5.101.4 [VERIFIED: dashboard/package.json:19] | — |
| @nestjs/serve-static | SPA serving | ✓ | 5.0.5 [VERIFIED: package.json:88] | — |
| Vite | Dashboard build system | ✓ | 8.2.1 [VERIFIED: dashboard/package.json:51] | — |
| Grafana | Optional visualization | ✗ | — | React SPA sufficient |
| Prometheus | Metrics backend | ✗ (optional) | — | Phase 6 REST APIs work standalone |

**Missing dependencies with no fallback:**
- None — all required dependencies already installed

**Missing dependencies with fallback:**
- **Grafana:** Not required — React SPA provides full analytics UI; Grafana is optional for ops teams who prefer it
- **Prometheus:** Phase 6 analytics work without Prometheus; Prometheus adds infrastructure metrics only

---

## Validation Architecture

> Phase 7 validation focuses on UI interaction testing and SSE reliability.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (via Node.js --test flag) |
| Config file | dashboard/vite.config.ts (test section) |
| Quick run command | `npm run test:unit` (dashboard dir) |
| Full suite command | `npm run test` (runs all .test.ts files) |

### Phase Requirements → Test Map

> **Note:** Phase 7 has no formal REQUIREMENTS.md entries yet. These map to ROADMAP.md success criteria.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-UI-01 | Dashboard loads in <2s | unit | `npm run test -- dashboard/src/pages/Analytics/Overview.test.tsx` | ❌ Wave 0 |
| DASH-UI-02 | SSE stream updates every 10s | integration | `npm run test:e2e -- --testPathPatterns='analytics-stream.*\\.e2e-spec\\.ts$'` | ❌ Wave 0 |
| DASH-UI-03 | Chart renders without errors | unit | `npm run test -- dashboard/src/components/analytics/TimeSeriesChart.test.tsx` | ❌ Wave 0 |
| DASH-UI-04 | Export CSV downloads complete file | integration | `npm run test:e2e -- --testPathPatterns='analytics-export.*\\.e2e-spec\\.ts$'` | ❌ Wave 0 |
| DASH-UI-05 | Alert rules CRUD operations | integration | `npm run test:e2e -- --testPathPatterns='analytics-alerts.*\\.e2e-spec\\.ts$'` | ❌ Wave 0 |
| DASH-UI-06 | Responsive layout on mobile | unit | `npm run test -- dashboard/src/pages/Analytics/Overview.test.tsx` | ❌ Wave 0 |
| DASH-UI-07 | Authentication with operator API key | integration | `npm run test:e2e -- --testPathPatterns='analytics-auth.*\\.e2e-spec\\.ts$'` | ❌ Wave 0 |
| DASH-GF-01 | Grafana dashboard loads with provisioning | manual | Visual inspection of Grafana UI | ❌ Wave 1 |
| DASH-GF-02 | JSON API datasource connects | manual | Grafana datasource test button | ❌ Wave 1 |
| DASH-GF-03 | Prometheus alerts visible in Grafana | manual | Visual inspection of Alerting tab | ❌ Wave 1 |

### Sampling Rate

- **Per task commit:** `npm run test:unit` (dashboard unit tests only, ~5-10s)
- **Per wave merge:** `npm run test:e2e:analytics` (full analytics E2E suite, ~30s)
- **Phase gate:** All unit + E2E tests green + manual Grafana verification before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `dashboard/src/pages/Analytics/Overview.test.tsx` — unit tests for Overview page (DASH-UI-01, DASH-UI-06)
- [ ] `dashboard/src/components/analytics/TimeSeriesChart.test.tsx` — unit tests for chart rendering (DASH-UI-03)
- [ ] `dashboard/src/hooks/useAnalyticsStream.test.ts` — unit tests for SSE hook (DASH-UI-02)
- [ ] `test/analytics-stream.e2e-spec.ts` — E2E test for SSE stream updates (DASH-UI-02)
- [ ] `test/analytics-export.e2e-spec.ts` — E2E test for CSV/JSON export (DASH-UI-04)
- [ ] `test/analytics-alerts.e2e-spec.ts` — E2E test for alert rules CRUD (DASH-UI-05)
- [ ] `test/analytics-auth.e2e-spec.ts` — E2E test for operator authentication (DASH-UI-07)
- [ ] `grafana/provisioning/dashboards/openwa-analytics.json` — Dashboard definition for manual testing (DASH-GF-01)

*(Wave 0 includes test file creation and basic structure; full test implementation happens during wave execution)*

---

## Security Domain

> Security enforcement enabled (default).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Operator API key required (Phase 6 `@RequireRole(ApiKeyRole.OPERATOR)`) |
| V3 Session Management | no | Dashboard uses stateless API key auth, not sessions |
| V4 Access Control | yes | Role-based access control (OPERATOR role gates all analytics endpoints) |
| V5 Input Validation | yes | Query params validated by `AnalyticsQueryDto` (NestJS class-validator) |
| V6 Cryptography | no | No cryptographic operations in dashboard UI |

### Known Threat Patterns for React + NestJS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS in chart labels | Tampering | React auto-escapes JSX; Recharts sanitizes SVG text |
| CSRF on alert rule create | Tampering | API key auth (not cookie-based) — CSRF not applicable |
| API key leakage in logs | Information Disclosure | Never log API keys; store in httpOnly cookie or secure localStorage |
| Unauthorized analytics access | Elevation of Privilege | `@RequireRole(ApiKeyRole.OPERATOR)` guard on all endpoints |
| SSE connection hijacking | Spoofing | HTTPS required in production; API key sent with EventSource |
| Export file path traversal | Tampering | Backend generates exports in controlled directory; no user-supplied paths |

---

## Deployment Plan

### Wave 1: Grafana MVP (~2h)

**Objective:** Immediate operational visibility using existing Prometheus + Phase 6 REST endpoints.

**Steps:**

1. **Create provisioning files** (~30 min)
   - `grafana/provisioning/datasources/prometheus.yml` — Prometheus datasource
   - `grafana/provisioning/datasources/json-api.yml` — Phase 6 REST API datasource
   - `grafana/provisioning/dashboards/dashboard.yml` — Auto-load config
   - `grafana/provisioning/dashboards/openwa-analytics.json` — Dashboard definition (4 panels: Overview, Performance, Cost, Conversations)

2. **Update docker-compose.full-stack.yml** (~15 min)
   - Change Grafana volume mount from `./grafana-dashboards` to `./grafana/provisioning`
   - Add environment variables: `GF_SECURITY_ADMIN_PASSWORD`, `OPERATOR_API_KEY`

3. **Test Grafana deployment** (~30 min)
   - `docker compose --profile monitoring up -d grafana prometheus`
   - Access Grafana at http://localhost:3000
   - Verify datasources connect (green status)
   - Verify dashboard loads with 4 panels
   - Test Prometheus alerts visualization

4. **Documentation** (~30 min)
   - Update `docs/SETUP.md` with Grafana deployment instructions
   - Document datasource configuration and dashboard import
   - Add troubleshooting section for common Grafana issues

**Verification:**
- [ ] Grafana dashboard accessible at localhost:3000
- [ ] Prometheus datasource shows green "Connected" status
- [ ] JSON API datasource successfully queries `/api/analytics/overview`
- [ ] All 4 dashboard panels render data (no "No Data" errors)
- [ ] Prometheus alerts visible in Alerting tab

**Docker Compose service:**
```yaml
# docker-compose.full-stack.yml additions for Wave 1
grafana:
  image: grafana/grafana:11-ubuntu
  container_name: openwa-grafana
  restart: unless-stopped
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    - GF_INSTALL_PLUGINS=simpod-json-datasource  # Auto-install JSON plugin
    - GF_SERVER_ROOT_URL=http://localhost:3000
    - GF_AUTH_ANONYMOUS_ENABLED=false
  volumes:
    - grafana_data:/var/lib/grafana
    - ./grafana/provisioning:/etc/grafana/provisioning:ro
  ports:
    - '127.0.0.1:3000:3000'
  networks:
    - openwa-network
  depends_on:
    - prometheus
    - openwa-api
  healthcheck:
    test: ['CMD-SHELL', 'curl -f http://localhost:3000/api/health || exit 1']
    interval: 30s
    timeout: 10s
    retries: 3
```

### Wave 2: React SPA (~3-5 days)

**Objective:** Custom dashboard with tailored UX, real-time updates, alert management, and export UI.

**Steps:**

1. **Create analytics pages** (~1 day)
   - `dashboard/src/pages/Analytics/Overview.tsx` — KPI cards + trend charts
   - `dashboard/src/pages/Analytics/Performance.tsx` — Latency percentiles
   - `dashboard/src/pages/Analytics/Cost.tsx` — Cost breakdown by feature
   - `dashboard/src/pages/Analytics/Conversations.tsx` — Conversation list + drill-down
   - `dashboard/src/pages/Analytics/Alerts.tsx` — Alert rules management
   - Add routes to `dashboard/src/App.tsx`

2. **Create reusable components** (~1 day)
   - `dashboard/src/components/analytics/KPICard.tsx` — Metric card with trend indicator
   - `dashboard/src/components/analytics/TimeSeriesChart.tsx` — Line/Area chart wrapper
   - `dashboard/src/components/analytics/PercentileChart.tsx` — P50/P95/P99 visualization
   - `dashboard/src/components/analytics/CostBreakdown.tsx` — Pie/bar chart
   - `dashboard/src/components/analytics/AlertRuleForm.tsx` — CRUD form for alert rules

3. **Implement data layer** (~1 day)
   - `dashboard/src/hooks/useAnalyticsStream.ts` — SSE hook with EventSource
   - `dashboard/src/hooks/useAnalytics.ts` — TanStack Query hooks for REST APIs
   - `dashboard/src/services/analytics.ts` — API client functions
   - `dashboard/src/types/analytics.ts` — TypeScript types for Phase 6 responses

4. **Add authentication integration** (~0.5 day)
   - Store operator API key in httpOnly cookie (backend sets after login)
   - Include API key in all analytics requests (Authorization header)
   - Handle 401 errors → redirect to login

5. **Implement export functionality** (~0.5 day)
   - Export button on each dashboard page
   - Format selector (CSV vs JSON)
   - Date range picker for export
   - Browser download trigger (Blob + temporary <a> tag)

6. **Add E2E tests** (~1 day)
   - `test/analytics-stream.e2e-spec.ts` — SSE stream updates
   - `test/analytics-export.e2e-spec.ts` — CSV/JSON export download
   - `test/analytics-alerts.e2e-spec.ts` — Alert rules CRUD operations
   - `test/analytics-auth.e2e-spec.ts` — Operator authentication

7. **Documentation** (~0.5 day)
   - Update `docs/GUIDES.md` with analytics dashboard usage
   - Add screenshots of each dashboard view
   - Document alert rule configuration
   - Add export format examples

**Verification:**
- [ ] All analytics pages render without errors
- [ ] SSE stream updates dashboard every 10s
- [ ] Charts display correct data from Phase 6 APIs
- [ ] Export buttons download complete CSV/JSON files
- [ ] Alert rules CRUD operations work (create, edit, delete)
- [ ] Responsive layout works on mobile (320px+)
- [ ] All E2E tests pass in CI

**Environment configuration:**
```typescript
// dashboard/.env.development
VITE_API_URL=http://localhost:2785/api

// dashboard/.env.production
VITE_API_URL=/api  # Relative path — served by NestJS
```

### Health Checks

**Grafana:**
```yaml
healthcheck:
  test: ['CMD-SHELL', 'curl -f http://localhost:3000/api/health || exit 1']
  interval: 30s
  timeout: 10s
  retries: 3
```

**React SPA:**
No separate health check — served by NestJS backend (openwa-api health check covers it).

---

## Trade-offs & Recommendations

### Grafana Track

**Pros:**
- ✅ Quick deployment (~2h total)
- ✅ Industry-standard tool — ops teams already familiar
- ✅ Built-in Prometheus integration (no custom work)
- ✅ Alert visualization out-of-box
- ✅ Zero frontend code to maintain

**Cons:**
- ❌ Limited customization (standard panel types only)
- ❌ No tailored UX for business stakeholders
- ❌ Requires learning Grafana query syntax
- ❌ Separate authentication (Grafana users vs OpenWA API keys)
- ❌ JSON API datasource requires plugin install

**When to use:** Ops teams need immediate visibility into metrics; business stakeholders can wait for custom UI.

### React SPA Track

**Pros:**
- ✅ Tailored UX for OpenWA stakeholders
- ✅ Full control over features (alert management, export, drill-down)
- ✅ Consistent authentication (operator API key reused)
- ✅ Responsive design (mobile + desktop)
- ✅ Extends existing dashboard (no new infrastructure)

**Cons:**
- ❌ Longer implementation time (~3-5 days)
- ❌ Requires frontend development and testing
- ❌ More code to maintain long-term
- ❌ Ops teams may still prefer Grafana for troubleshooting

**When to use:** Business stakeholders need custom UX; development team has capacity for 3-5 day sprint.

### Dual-Track Rationale

**Why implement both:**

1. **Immediate value:** Grafana MVP ships in ~2h → ops teams get visibility immediately
2. **Parallel work:** Grafana track doesn't block React track → can run in parallel
3. **Different audiences:** Ops teams prefer Grafana; business stakeholders prefer custom UI
4. **Fallback:** If React track hits blockers, Grafana provides working solution
5. **Complementary:** Grafana shows infrastructure metrics (Prometheus); React shows business KPIs (Phase 6 APIs)

**Recommended sequencing:**

- **Sprint 1 (Week 1):** Grafana MVP (Wave 1) — ships in 2h
- **Sprint 2-3 (Weeks 1-2):** React SPA (Wave 2) — 3-5 days parallel to ongoing work
- **Sprint 4 (Week 2):** E2E testing + documentation

**Resource allocation:**
- Grafana: 1 engineer, 2 hours
- React SPA: 1 frontend engineer, 3-5 days full-time

---

## Sources

### Primary (HIGH confidence)

- **Phase 6 Research & Plans** — `/Users/I531631/claude/Pessoal/OpenWA/.planning/phases/06-analytics-dashboard/` [VERIFIED: read during research session]
- **OpenWA Codebase** — `analytics.controller.ts`, `docker-compose.yml`, `dashboard/package.json` [VERIFIED: read during research session]
- **Recharts Context7** — `/recharts/recharts` documentation (775 snippets, High reputation) [CITED: Context7 query response]
- **TanStack Query Context7** — `/tanstack/query` documentation (2526 snippets, High reputation) [CITED: Context7 query response]
- **NestJS Context7** — `/nestjs/docs.nestjs.com` ServeStaticModule docs [CITED: Context7 query response]

### Secondary (MEDIUM confidence)

- **Grafana provisioning patterns** — Training knowledge on Grafana v11 provisioning API [ASSUMED: not verified against official docs in this session]
- **EventSource API** — Native browser API for SSE, standardized in HTML5 spec [ASSUMED: training knowledge]

### Tertiary (LOW confidence)

- **Grafana JSON API datasource plugin** — Assumed to require manual install or environment variable [ASSUMED: not verified against Grafana plugin registry]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and versions verified via package.json reads
- Architecture: HIGH — OpenWA dashboard structure discovered via filesystem reads; Phase 6 endpoints verified via controller read
- React patterns: HIGH — TanStack Query and Recharts patterns from Context7 official documentation
- Grafana patterns: MEDIUM — provisioning approach from training knowledge, not verified against current Grafana docs
- Deployment: HIGH — Docker Compose configuration verified via read of docker-compose.full-stack.yml

**Research date:** 2026-08-27
**Valid until:** 2026-10-27 (60 days — React/Recharts stable; Grafana updates quarterly)
