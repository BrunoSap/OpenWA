// Simple test script to verify metrics endpoint
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/metrics' || req.url === '/api/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`# HELP test_metric Test metric
# TYPE test_metric counter
test_metric 1
`);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(9999, () => {
  console.log('Test metrics server on http://localhost:9999/metrics');
});
