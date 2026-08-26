import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shape (forma) test for the n8n audio transcription workflow. Unlike the other e2e suites,
 * this one boots no Nest app and touches no DB — it only asserts that
 * WhatsApp-Audio-Transcription.json is a valid, importable n8n workflow whose structure includes:
 * - Webhook entry point for audio events
 * - Transcription processing node (validates message.transcription event)
 * - LLM node for audio-aware response generation
 * - HTTP node that sends responses via /messages/send-text
 * - NO literal secrets (only $env references)
 *
 * Guards threats T-03-01 (hardcoded secret in workflow JSON) and validates STT-01/02/03/04.
 */
describe('Audio workflow shape (e2e)', () => {
  const workflowPath = join(__dirname, '..', 'WhatsApp-Audio-Transcription.json');
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
    expect(workflow.name).toBe('WhatsApp Audio Transcription');
    expect(Array.isArray(workflow.nodes)).toBe(true);
    expect(workflow.nodes!.length).toBeGreaterThan(0);
    expect(typeof workflow.connections).toBe('object');
    expect(workflow.connections).not.toBeNull();
  });

  it('has at least one webhook entry node', () => {
    const webhooks = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.webhook');
    expect(webhooks.length).toBeGreaterThanOrEqual(1);

    // Verify webhook path is set for audio events
    const audioWebhook = webhooks.find((n) => {
      const params = n.parameters as { path?: string } | undefined;
      return params?.path === 'whatsapp-audio';
    });
    expect(audioWebhook).toBeDefined();
  });

  it('has a code node that processes message.transcription events (STT-02)', () => {
    const codeNodes = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.code');
    expect(codeNodes.length).toBeGreaterThanOrEqual(1);

    // Find the transcription processing node by inspecting its code
    const transcriptionNode = codeNodes.find((n) => {
      const params = n.parameters as { jsCode?: string } | undefined;
      const code = params?.jsCode ?? '';
      return code.includes('message.transcription') && code.includes('transcription.text');
    });

    expect(transcriptionNode).toBeDefined();
    expect(transcriptionNode?.name).toContain('Processar Transcrição');
  });

  it('has an LLM chain node for audio-aware response generation (STT-04)', () => {
    const llmNodes = workflow.nodes!.filter(
      (n) =>
        n.type === '@n8n/n8n-nodes-langchain.chainLlm' ||
        n.type === '@n8n/n8n-nodes-langchain.lmChatGroq' ||
        n.type === '@n8n/n8n-nodes-langchain.lmChatOpenAI',
    );
    expect(llmNodes.length).toBeGreaterThanOrEqual(1);

    // Verify there's an LLM chain node (chainLlm type)
    const chainNode = workflow.nodes!.find((n) => n.type === '@n8n/n8n-nodes-langchain.chainLlm');
    expect(chainNode).toBeDefined();
  });

  it('has an httpRequest node whose parameters reference the /messages/send-text route', () => {
    const httpNodes = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.httpRequest');
    expect(httpNodes.length).toBeGreaterThanOrEqual(1);

    const sendNode = httpNodes.find((n) => JSON.stringify(n.parameters ?? {}).includes('/messages/send-text'));
    expect(sendNode).toBeDefined();
    expect(sendNode?.name).toContain('WhatsApp');
  });

  it('contains NO literal secrets — only $env references (guards T-03-01)', () => {
    const parsed = JSON.parse(raw) as N8nWorkflow;
    const serialized = JSON.stringify(parsed);

    // Negative-grep: OpenAI/Groq-style secret prefixes must NOT appear as literal values.
    // Build patterns programmatically to avoid neutralizing the assertion.
    const openAiPrefix = 'sk-';
    const groqPrefix = 'gsk_';
    const bearerPrefix = 'Bearer ';

    const openAiKeyPattern = new RegExp(`${openAiPrefix}[A-Za-z0-9]{16,}`);
    const groqKeyPattern = new RegExp(`${groqPrefix}[A-Za-z0-9]{16,}`);
    const bearerLiteralPattern = new RegExp(`${bearerPrefix}[A-Za-z0-9._-]{16,}`);

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

  it('workflow validates transcription event structure (STT-01)', () => {
    // Find the code node that validates the event type
    const codeNodes = workflow.nodes!.filter((n) => n.type === 'n8n-nodes-base.code');
    const validationNode = codeNodes.find((n) => {
      const params = n.parameters as { jsCode?: string } | undefined;
      const code = params?.jsCode ?? '';
      return code.includes("event !== 'message.transcription'") || code.includes("event === 'message.transcription'");
    });

    expect(validationNode).toBeDefined();
  });
});
