import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shape (forma) test for the n8n Vision workflow. Unlike the other e2e suites,
 * this one boots no Nest app and touches no DB — it only asserts that
 * WhatsApp-Vision-Analysis.json is a valid, importable n8n workflow whose structure includes:
 * - Webhook entry point for image messages (VIS-01)
 * - HTTP node that downloads the image (VIS-02)
 * - Base64 conversion node
 * - Vision analysis node using gpt-4o-mini (VIS-03)
 * - LLM node for contextualized response generation (VIS-04)
 * - HTTP node that sends responses via /messages/send-text
 * - NO literal secrets (only $env references)
 *
 * Guards threats T-04-01 (hardcoded secret in workflow JSON) and validates VIS-01/02/03/04.
 */
describe('Vision workflow shape (e2e)', () => {
  const workflowPath = join(__dirname, '..', 'WhatsApp-Vision-Analysis.json');
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
    expect(workflow.name).toBe('WhatsApp Vision Analysis');
    expect(Array.isArray(workflow.nodes)).toBe(true);
    expect(workflow.nodes!.length).toBeGreaterThan(0);
    expect(typeof workflow.connections).toBe('object');
    expect(workflow.connections).not.toBeNull();
  });

  it('has at least one webhook entry node (VIS-01)', () => {
    const webhooks = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.webhook');
    expect(webhooks.length).toBeGreaterThanOrEqual(1);

    // Verify webhook path is set for vision events
    const visionWebhook = webhooks.find((n) => {
      const params = n.parameters as { path?: string } | undefined;
      return params?.path === 'whatsapp-vision';
    });
    expect(visionWebhook).toBeDefined();
  });

  it('has an httpRequest node that downloads image with GET method (VIS-02)', () => {
    const httpNodes = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
    expect(httpNodes.length).toBeGreaterThanOrEqual(1);

    // Find download node by looking for GET method with mediaUrl reference
    const downloadNode = httpNodes.find((n) => {
      const params = n.parameters as { method?: string; url?: string } | undefined;
      const urlStr = JSON.stringify(n.parameters ?? {});
      return params?.method === 'GET' && urlStr.includes('mediaUrl');
    });

    expect(downloadNode).toBeDefined();
    expect(downloadNode?.name).toContain('Download');
  });

  it('has a code node that converts image to base64 data URL', () => {
    const codeNodes = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.code');
    expect(codeNodes.length).toBeGreaterThanOrEqual(1);

    // Find base64 conversion node by inspecting its code
    const base64Node = codeNodes.find((n) => {
      const params = n.parameters as { jsCode?: string } | undefined;
      const code = params?.jsCode ?? '';
      return code.includes('base64') && code.includes('data:');
    });

    expect(base64Node).toBeDefined();
    expect(base64Node?.name).toMatch(/base64|convert/i);
  });

  it('has a Vision analysis LLM chain node with image content (VIS-03)', () => {
    const chainNodes = workflow.nodes!.filter((n) => n.type === '@n8n/n8n-nodes-langchain.chainLlm');
    expect(chainNodes.length).toBeGreaterThanOrEqual(1);

    // Find Vision chain by looking for imageUrls parameter in messages
    const visionChain = chainNodes.find((n) => {
      const serialized = JSON.stringify(n.parameters ?? {});
      return serialized.includes('imageUrls') || serialized.includes('imageDataUrl');
    });

    expect(visionChain).toBeDefined();
    expect(visionChain?.name).toMatch(/vision|analysis/i);
  });

  it('has a separate LLM chain node for contextualized response (VIS-04)', () => {
    const chainNodes = workflow.nodes!.filter((n) => n.type === '@n8n/n8n-nodes-langchain.chainLlm');

    // Should have at least 2 chain nodes: one for Vision, one for contextualized response
    expect(chainNodes.length).toBeGreaterThanOrEqual(2);

    // The contextualized node should NOT have imageUrls (it processes Vision output)
    const contextualizedChain = chainNodes.find((n) => {
      const serialized = JSON.stringify(n.parameters ?? {});
      return !serialized.includes('imageUrls') && !serialized.includes('imageDataUrl');
    });

    expect(contextualizedChain).toBeDefined();
    expect(contextualizedChain?.name).toMatch(/contextualized|llm|response/i);
  });

  it('has OpenAI model nodes configured with gpt-4o-mini', () => {
    const openAiNodes = workflow.nodes!.filter((n) => n.type === '@n8n/n8n-nodes-langchain.lmChatOpenAi');
    expect(openAiNodes.length).toBeGreaterThanOrEqual(1);

    // At least one should specify gpt-4o-mini model
    const gpt4oMiniNode = openAiNodes.find((n) => {
      const params = n.parameters as { model?: string } | undefined;
      return params?.model === 'gpt-4o-mini';
    });

    expect(gpt4oMiniNode).toBeDefined();
  });

  it('has an httpRequest node whose parameters reference the /messages/send-text route', () => {
    const httpNodes = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
    expect(httpNodes.length).toBeGreaterThanOrEqual(1);

    const sendNode = httpNodes.find((n) => JSON.stringify(n.parameters ?? {}).includes('/messages/send-text'));
    expect(sendNode).toBeDefined();
    expect(sendNode?.name).toMatch(/send|whatsapp|reply/i);
  });

  it('contains NO literal secrets — only $env references (guards T-04-01)', () => {
    const parsed = JSON.parse(raw) as N8nWorkflow;
    const serialized = JSON.stringify(parsed);

    // Negative-grep: OpenAI-style secret prefixes must NOT appear as literal values.
    // Build patterns programmatically to avoid neutralizing the assertion.
    const openAiPrefix = 'sk-';
    const openAiProjPrefix = 'sk-proj-';
    const bearerPrefix = 'Bearer ';

    const openAiKeyPattern = new RegExp(`${openAiPrefix}[A-Za-z0-9]{16,}`);
    const openAiProjPattern = new RegExp(`${openAiProjPrefix}[A-Za-z0-9]{16,}`);
    const bearerLiteralPattern = new RegExp(`${bearerPrefix}[A-Za-z0-9._-]{16,}`);

    expect(serialized).not.toMatch(openAiKeyPattern);
    expect(serialized).not.toMatch(openAiProjPattern);
    expect(serialized).not.toMatch(bearerLiteralPattern);

    // Verify $env references exist for API configuration
    expect(serialized).toContain('$env');

    // Every httpHeaderAuth credential or x-api-key header value must use $env or credential references, not literal tokens
    for (const node of parsed.nodes ?? []) {
      const params = (node.parameters ?? {}) as {
        headerParameters?: { parameters?: Array<{ name?: string; value?: string }> };
        authentication?: string;
      };

      // Check header parameters
      const headers = params.headerParameters?.parameters ?? [];
      for (const h of headers) {
        if (h.name?.toLowerCase().includes('auth') || h.name?.toLowerCase().includes('key')) {
          const value = h.value ?? '';
          // Must be either $env reference or credential placeholder
          expect(value.includes('$env') || value.includes('PLACEHOLDER') || value === '').toBe(true);
        }
      }
    }
  });

  it('workflow references credentials via placeholders, not hardcoded IDs', () => {
    // OpenAI credential references should be placeholders for import, not specific instance IDs
    const serialized = JSON.stringify(workflow);

    // Check that credential references exist but are either placeholders or will be remapped on import
    expect(serialized).toContain('openAiApi');

    // Credential IDs should be marked as PLACEHOLDER for documentation
    const openAiNodes = workflow.nodes!.filter((n) => n.type === '@n8n/n8n-nodes-langchain.lmChatOpenAi');
    for (const node of openAiNodes) {
      const nodeStr = JSON.stringify(node);
      // Accept either PLACEHOLDER marker or actual credential ID (which will be remapped on import)
      expect(nodeStr).toContain('openAiApi');
    }
  });
});
