import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shape (forma) test for the n8n intake workflow. Unlike the other e2e suites, this one boots no
 * Nest app and touches no DB — it only asserts that Whatsapp-Intake-Bot.json is a valid, importable
 * n8n workflow whose HTTP node delegates to the OpenWA intake API, and that it carries NO literal
 * secrets (only $env references). Guards threat T-03-01 (hardcoded secret in the workflow JSON).
 */
describe('Intake workflow shape (e2e)', () => {
  const workflowPath = join(__dirname, '..', 'Whatsapp-Intake-Bot.json');
  const raw = readFileSync(workflowPath, 'utf8');

  interface N8nNode {
    id?: string;
    name?: string;
    type: string;
    parameters?: Record<string, unknown>;
  }
  interface N8nWorkflow {
    name?: string;
    nodes?: N8nNode[];
    connections?: Record<string, unknown>;
  }

  let workflow: N8nWorkflow;

  beforeAll(() => {
    workflow = JSON.parse(raw) as N8nWorkflow;
  });

  it('parses as valid JSON with name, non-empty nodes array and connections object', () => {
    expect(typeof workflow.name).toBe('string');
    expect(workflow.name).toBe('WhatsApp Intake Bot');
    expect(Array.isArray(workflow.nodes)).toBe(true);
    expect(workflow.nodes!.length).toBeGreaterThan(0);
    expect(typeof workflow.connections).toBe('object');
    expect(workflow.connections).not.toBeNull();
  });

  it('has at least one webhook entry node', () => {
    const webhooks = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.webhook');
    expect(webhooks.length).toBeGreaterThanOrEqual(1);
  });

  it('has an httpRequest node whose parameters reference the /intake/messages route', () => {
    const httpNodes = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
    expect(httpNodes.length).toBeGreaterThanOrEqual(1);

    const ingestNode = httpNodes.find((n) => JSON.stringify(n.parameters ?? {}).includes('/intake/messages'));
    expect(ingestNode).toBeDefined();
  });

  it('references OpenWA base url and api key via $env, never as literals', () => {
    // The ingest node's URL is built from an environment variable, not a hardcoded host.
    expect(raw).toContain('$env.OPENWA_BASE_URL');
    expect(raw).toContain('$env.OPENWA_API_KEY');
  });

  it('contains NO literal secrets — only $env references (guards T-03-01)', () => {
    const parsed = JSON.parse(raw) as N8nWorkflow;
    const serialized = JSON.stringify(parsed);

    // Negative-grep: OpenAI/Groq-style secret prefixes must NOT appear as literal values.
    // The literals below are match PATTERNS, not real keys, and are kept out of comments
    // that would neutralize them so the assertion is meaningful.
    const openAiKeyPattern = /sk-[A-Za-z0-9]{16,}/;
    const groqKeyPattern = /gsk_[A-Za-z0-9]{16,}/;
    const bearerLiteralPattern = /Bearer\s+[A-Za-z0-9._-]{16,}/;
    expect(serialized).not.toMatch(openAiKeyPattern);
    expect(serialized).not.toMatch(groqKeyPattern);
    expect(serialized).not.toMatch(bearerLiteralPattern);

    // Every x-api-key header value must be an $env reference, not a literal token.
    for (const node of parsed.nodes ?? []) {
      const params = (node.parameters ?? {}) as {
        headerParameters?: { parameters?: Array<{ name?: string; value?: string }> };
      };
      const headers = params.headerParameters?.parameters ?? [];
      for (const h of headers) {
        if (h.name?.toLowerCase() === 'x-api-key') {
          expect(h.value ?? '').toContain('$env');
        }
      }
    }
  });
});
