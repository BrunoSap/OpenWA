import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { AnalyticsIntentTaxonomy } from '../entities/analytics-intent-taxonomy.entity';
import { AnalyticsIntentClassification } from '../entities/analytics-intent-classification.entity';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 10 Plan 01: Intent classification service using Anthropic Batch API (DASH-03).
 *
 * Classifies messages into tenant-defined intent categories using Claude 3 Haiku with prompt
 * caching. The system prompt containing the taxonomy is cached across the batch (cache_control:
 * ephemeral) for 83% cost reduction vs real-time API.
 *
 * Cost calculation per RESEARCH.md L98-109:
 * - Cache creation: 500 tokens × $3.75/M = $0.001875 (once per batch)
 * - Cache read: 500 tokens × $0.30/M = $0.00015 (per message)
 * - Non-cached: 100 tokens × $1.50/M = $0.00015 (per message)
 * - Total per message: $0.0003 (vs $0.0018 real-time = 83% reduction)
 *
 * Cache hit rate target: >80% per RESEARCH.md L142-144.
 */
@Injectable()
export class IntentClassificationService {
  private readonly logger = createLogger('IntentClassificationService');
  private anthropic: Anthropic;

  constructor(
    @InjectRepository(AnalyticsIntentTaxonomy, 'data')
    private readonly taxonomyRepository: Repository<AnalyticsIntentTaxonomy>,
    @InjectRepository(AnalyticsIntentClassification, 'data')
    private readonly classificationRepository: Repository<AnalyticsIntentClassification>,
  ) {
    // Initialize Anthropic client
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY not set — intent classification will fail');
    }
    this.anthropic = new Anthropic({ apiKey: apiKey || 'dummy-key' });
  }

  /**
   * Classify a batch of messages using Anthropic Batch API with prompt caching.
   *
   * @param messages - Array of messages to classify (id + text)
   * @param tenantId - Tenant identifier (default: 'global')
   * @returns Array of classification results with intent and confidence
   *
   * @remarks
   * - Fetches taxonomy for tenant
   * - Builds system prompt with cache_control
   * - Creates batch request via Anthropic API
   * - Polls batch status until completion
   * - Fetches results and tracks cache hit rate
   */
  async classifyIntentsBatch(
    messages: { id: string; text: string }[],
    tenantId: string = 'global',
  ): Promise<{ messageId: string; intent: string; confidence?: number }[]> {
    if (!process.env.ANTHROPIC_API_KEY) {
      this.logger.warn('ANTHROPIC_API_KEY not set — using fallback rule-based classification');
      return this.fallbackClassification(messages);
    }

    // Fetch taxonomy for tenant
    const taxonomy = await this.taxonomyRepository.find({
      where: { tenant_id: tenantId },
      order: { intent_name: 'ASC' },
    });

    if (taxonomy.length === 0) {
      this.logger.warn(`No taxonomy found for tenant ${tenantId} — using default taxonomy`);
      await this.seedDefaultTaxonomy(tenantId);
      return this.classifyIntentsBatch(messages, tenantId); // Retry after seeding
    }

    // Build system prompt with cache_control per RESEARCH.md L113-134
    const systemPrompt = {
      type: 'text' as const,
      text: `You are an intent classifier. Given a message, classify it into one of these categories:

${taxonomy.map((t) => `- ${t.intent_name}: ${t.intent_description || 'No description'}`).join('\n')}

Return ONLY the intent name, nothing else.`,
      cache_control: { type: 'ephemeral' as const }, // Cache this prompt across batch
    };

    this.logger.log(`Creating batch request for ${messages.length} messages`);

    // Create batch request
    const batch = await (this.anthropic.messages as any).batches.create({
      requests: messages.map((msg) => ({
        custom_id: msg.id,
        params: {
          model: 'claude-3-haiku-20240307', // Cheapest model per RESEARCH.md L131
          max_tokens: 20,
          system: [systemPrompt],
          messages: [{ role: 'user', content: msg.text }],
        },
      })),
    });

    this.logger.log(`Batch created: ${batch.id}, status: ${batch.processing_status}`);

    // Poll for completion
    let batchStatus = await (this.anthropic.messages as any).batches.retrieve(batch.id);
    const maxPolls = 60; // 5 minutes max (5s intervals)
    let pollCount = 0;

    while (batchStatus.processing_status !== 'ended' && pollCount < maxPolls) {
      await this.sleep(5000);
      batchStatus = await (this.anthropic.messages as any).batches.retrieve(batch.id);
      pollCount++;
      this.logger.log(`Poll ${pollCount}: Batch status ${batchStatus.processing_status}`);
    }

    if (batchStatus.processing_status !== 'ended') {
      throw new Error(`Batch processing timeout after ${pollCount} polls`);
    }

    // Fetch results
    const results: { messageId: string; intent: string; confidence?: number }[] = [];
    let totalCacheReadTokens = 0;
    let totalInputTokens = 0;

    for await (const result of (this.anthropic.messages as any).batches.results(batch.id)) {
      if (result.result.type === 'succeeded') {
        const message = result.result.message;
        const content = message.content[0];

        if (content.type === 'text') {
          const intent = content.text.trim();
          results.push({
            messageId: result.custom_id,
            intent,
          });

          // Track cache metrics
          const usage = message.usage;
          totalInputTokens +=
            usage.input_tokens +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0);
          totalCacheReadTokens += usage.cache_read_input_tokens ?? 0;
        }
      } else {
        this.logger.warn(`Message ${result.custom_id} failed: ${result.result.type}`);
      }
    }

    // Calculate and log cache hit rate
    const cacheHitRate = totalInputTokens > 0 ? totalCacheReadTokens / totalInputTokens : 0;
    this.logger.log(
      `Batch completed: ${results.length} results, cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`,
    );

    if (cacheHitRate < 0.8) {
      this.logger.warn(`Cache hit rate below target: ${(cacheHitRate * 100).toFixed(1)}% < 80%`);
    }

    return results;
  }

  /**
   * Seed default taxonomy for a tenant.
   *
   * Default intents per RESEARCH.md L162-169:
   * - FAQ: Perguntas frequentes sobre produto/serviço
   * - Suporte Técnico: Problemas técnicos, bugs, troubleshooting
   * - Vendas: Interesse em comprar, pricing, features
   * - Reclamação: Insatisfação, problemas com atendimento
   * - Outros: Mensagens que não se encaixam nas categorias acima
   */
  private async seedDefaultTaxonomy(tenantId: string): Promise<void> {
    const defaultIntents = [
      {
        tenant_id: tenantId,
        intent_name: 'FAQ',
        intent_description: 'Perguntas frequentes sobre produto/serviço',
      },
      {
        tenant_id: tenantId,
        intent_name: 'Suporte Técnico',
        intent_description: 'Problemas técnicos, bugs, troubleshooting',
      },
      {
        tenant_id: tenantId,
        intent_name: 'Vendas',
        intent_description: 'Interesse em comprar, pricing, features',
      },
      {
        tenant_id: tenantId,
        intent_name: 'Reclamação',
        intent_description: 'Insatisfação, problemas com atendimento',
      },
      {
        tenant_id: tenantId,
        intent_name: 'Outros',
        intent_description: 'Mensagens que não se encaixam nas categorias acima',
      },
    ];

    await this.taxonomyRepository.save(defaultIntents);
    this.logger.log(`Seeded default taxonomy for tenant ${tenantId}`);
  }

  /**
   * Fallback rule-based classification when Anthropic API unavailable.
   *
   * Uses simple keyword matching (low accuracy ~60% vs LLM 80%+).
   */
  private fallbackClassification(
    messages: { id: string; text: string }[],
  ): { messageId: string; intent: string; confidence?: number }[] {
    return messages.map((msg) => {
      const text = msg.text.toLowerCase();

      if (text.includes('senha') || text.includes('login') || text.includes('como')) {
        return { messageId: msg.id, intent: 'FAQ', confidence: 0.6 };
      } else if (text.includes('erro') || text.includes('travando') || text.includes('bug')) {
        return { messageId: msg.id, intent: 'Suporte Técnico', confidence: 0.6 };
      } else if (text.includes('preço') || text.includes('comprar') || text.includes('plano')) {
        return { messageId: msg.id, intent: 'Vendas', confidence: 0.6 };
      } else if (
        text.includes('insatisfeito') ||
        text.includes('péssimo') ||
        text.includes('reclamação')
      ) {
        return { messageId: msg.id, intent: 'Reclamação', confidence: 0.6 };
      } else {
        return { messageId: msg.id, intent: 'Outros', confidence: 0.6 };
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
