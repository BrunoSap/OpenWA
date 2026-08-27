import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_INSTANCE_ID } from '@opentelemetry/semantic-conventions';

export function initTelemetry() {
  const traceEnabled = process.env.TELEMETRY_ENABLED === 'true';

  if (!traceEnabled) {
    return null;
  }

  const serviceName = process.env.TELEMETRY_SERVICE_NAME || 'openwa-api';
  const replicaId = process.env.HOSTNAME || 'unknown-replica';  // Docker hostname = container name

  const traceExporter = new OTLPTraceExporter({
    url: process.env.TELEMETRY_OTLP_ENDPOINT || 'http://jaeger:4318/v1/traces',
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_INSTANCE_ID]: replicaId,
      'replica.id': replicaId,  // Custom attribute for filtering
    }),
    traceExporter,
    instrumentations: [
      new HttpInstrumentation({
        // Inject traceparent header in outgoing requests
        requestHook: (span, request) => {
          span.setAttribute('http.client_ip', request.headers['x-forwarded-for'] || 'unknown');
          span.setAttribute('http.replica', replicaId);
        },
      }),
      new ExpressInstrumentation(),
    ],
  });

  sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.error('Error terminating tracing', error));
  });

  return sdk;
}
