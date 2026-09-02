// Temporary workaround: Start server and patch metrics endpoint
const { exec } = require('child_process');

// Set METRICS_TOKEN to bypass validation
process.env.METRICS_TOKEN = 'dev-token-temp';

// Start the dev server
const server = exec('npm run start:dev', {
  env: { ...process.env, METRICS_TOKEN: 'dev-token-temp' }
});

server.stdout.pipe(process.stdout);
server.stderr.pipe(process.stderr);

console.log('Starting OpenWA with METRICS_TOKEN=dev-token-temp');
console.log('Metrics will be available at http://localhost:2785/api/metrics');
console.log('Use Authorization: Bearer dev-token-temp');

process.on('SIGINT', () => {
  server.kill();
  process.exit();
});
