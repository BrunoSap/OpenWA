const express = require('express');
const client = require('prom-client');

// Create Express app
const app = express();
const register = new client.Registry();

// Collect default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom OpenWA metrics
const httpRequestsTotal = new client.Counter({
  name: 'openwa_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register]
});

const whatsappMessagesTotal = new client.Counter({
  name: 'openwa_whatsapp_messages_total',
  help: 'Total number of WhatsApp messages',
  labelNames: ['type', 'status'],
  registers: [register]
});

const whatsappActiveSessions = new client.Gauge({
  name: 'openwa_whatsapp_active_sessions',
  help: 'Number of active WhatsApp sessions',
  registers: [register]
});

// Simulate some data
httpRequestsTotal.inc({ method: 'GET', path: '/api/sessions', status: '200' }, 10);
httpRequestsTotal.inc({ method: 'POST', path: '/api/messages', status: '200' }, 25);
whatsappMessagesTotal.inc({ type: 'sent', status: 'success' }, 15);
whatsappMessagesTotal.inc({ type: 'received', status: 'success' }, 30);
whatsappActiveSessions.set(3);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'OpenWA Metrics Proxy' });
});

const PORT = 2786;
app.listen(PORT, () => {
  console.log(`OpenWA Metrics Proxy running on http://localhost:${PORT}/metrics`);
  console.log('Configure Prometheus to scrape: http://localhost:2786/metrics');
});
