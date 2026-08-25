#!/usr/bin/env node
/**
 * 🤖 Chatbot LLM para OpenWA
 *
 * Recebe mensagens via webhook do OpenWA e responde automaticamente
 * usando Groq (com fallback para OpenAI e Anthropic)
 *
 * Usa Redis do OpenWA para armazenar contexto de conversas
 */

const express = require('express');
const axios = require('axios');
const Redis = require('ioredis');

// ========================================
// CONFIGURAÇÃO
// ========================================

const CONFIG = {
  port: 3001,
  openwaApi: 'http://localhost:2785/api',
  openwaKey: process.env.OPENWA_API_KEY || 'owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc',
  sessionId: process.env.SESSION_ID || '75a54c72-fade-48af-9059-cf56362df076',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
};

// Providers LLM com fallback
const LLM_PROVIDERS = [
  {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    apiKey: process.env.GROQ_API_KEY,
    enabled: !!process.env.GROQ_API_KEY
  },
  {
    name: 'openai',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    enabled: !!process.env.OPENAI_API_KEY
  },
  {
    name: 'anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-5-haiku-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY,
    enabled: !!process.env.ANTHROPIC_API_KEY
  }
].filter(p => p.enabled);

// ========================================
// REDIS CLIENT
// ========================================

const redis = new Redis(CONFIG.redis);

redis.on('connect', () => {
  console.log('✅ [Redis] Conectado');
});

redis.on('error', (err) => {
  console.error('❌ [Redis] Erro:', err.message);
});

// ========================================
// FUNÇÕES DE CONTEXTO
// ========================================

async function getConversationContext(chatId) {
  try {
    const key = `llm:conversation:${chatId}`;
    const messages = await redis.lrange(key, -10, -1);
    return messages.map(m => JSON.parse(m));
  } catch (error) {
    console.error('[Contexto] Erro ao buscar:', error.message);
    return [];
  }
}

async function saveMessageToContext(chatId, role, content) {
  try {
    const key = `llm:conversation:${chatId}`;
    const message = {
      role,
      content,
      timestamp: Date.now()
    };

    await redis.rpush(key, JSON.stringify(message));
    await redis.expire(key, 86400); // 24h TTL

    // Manter apenas últimas 20 mensagens
    const count = await redis.llen(key);
    if (count > 20) {
      await redis.ltrim(key, -20, -1);
    }
  } catch (error) {
    console.error('[Contexto] Erro ao salvar:', error.message);
  }
}

async function checkDailyLimit(chatId) {
  const today = new Date().toISOString().split('T')[0];
  const key = `llm:daily:${today}:${chatId}`;

  const count = await redis.incr(key);
  await redis.expire(key, 86400);

  return count;
}

// ========================================
// LLM COM FALLBACK
// ========================================

async function callLLM(messages, attempt = 0) {
  if (attempt >= LLM_PROVIDERS.length) {
    throw new Error('Todos os provedores LLM falharam');
  }

  const provider = LLM_PROVIDERS[attempt];

  try {
    console.log(`🔄 [LLM] Tentando ${provider.name}...`);

    if (provider.name === 'anthropic') {
      // Anthropic usa formato diferente
      const response = await axios.post(
        provider.url,
        {
          model: provider.model,
          max_tokens: 1024,
          messages: messages.map(m => ({
            role: m.role === 'system' ? 'user' : m.role,
            content: m.content
          }))
        },
        {
          headers: {
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        provider: provider.name,
        content: response.data.content[0].text
      };
    } else {
      // OpenAI-compatible (Groq, OpenAI)
      const response = await axios.post(
        provider.url,
        {
          model: provider.model,
          messages,
          temperature: 0.7,
          max_tokens: 1024
        },
        {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        provider: provider.name,
        content: response.data.choices[0].message.content
      };
    }
  } catch (error) {
    console.error(`❌ [LLM] ${provider.name} falhou:`, error.response?.data || error.message);

    // Rate limit ou timeout? Tentar próximo provider
    if (error.response?.status === 429 ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNABORTED') {
      console.log(`⏭️  [LLM] Tentando próximo provider...`);
      return await callLLM(messages, attempt + 1);
    }

    throw error;
  }
}

// ========================================
// OPENWA API
// ========================================

async function sendMessage(chatId, text) {
  try {
    await axios.post(
      `${CONFIG.openwaApi}/sessions/${CONFIG.sessionId}/chats/${chatId}/messages`,
      { text },
      {
        headers: { 'x-api-key': CONFIG.openwaKey }
      }
    );
  } catch (error) {
    // Tentar endpoint alternativo
    await axios.post(
      `${CONFIG.openwaApi}/sessions/${CONFIG.sessionId}/messages/send`,
      {
        to: chatId,
        text,
        type: 'text'
      },
      {
        headers: { 'x-api-key': CONFIG.openwaKey }
      }
    );
  }
}

async function setTyping(chatId, isTyping = true) {
  try {
    const endpoint = isTyping ? 'typing' : 'available';
    await axios.post(
      `${CONFIG.openwaApi}/sessions/${CONFIG.sessionId}/presence/${endpoint}`,
      { chatId },
      {
        headers: { 'x-api-key': CONFIG.openwaKey },
        timeout: 5000
      }
    );
  } catch (error) {
    // Ignorar erros de presence
  }
}

// ========================================
// PROCESSAMENTO DE MENSAGENS
// ========================================

const SYSTEM_PROMPT = `Você é um assistente virtual do Lawapp, plataforma brasileira de gestão jurídica.

🎯 DIRETRIZES:
- Seja profissional, educado e conciso
- Responda SEMPRE em português brasileiro
- Máximo 2-3 parágrafos por resposta
- Para dúvidas jurídicas complexas, oriente a consultar um advogado
- Não invente informações sobre funcionalidades que não conhece

📋 INFORMAÇÕES:
- Plataforma: Lawapp (gestão de processos jurídicos, clientes, prazos)
- Horário de atendimento: Seg-Sex, 9h-18h BRT
- Email suporte: suporte@lawapp.com.br
- Website: https://lawapp.com.br

💬 TOM:
- Amigável mas profissional
- Claro e objetivo
- Proativo em ajudar`;

async function processMessage(data) {
  const { from, body, fromMe, isGroupMsg, type } = data;

  try {
    // Ignorar mensagens próprias
    if (fromMe) return;

    // Ignorar grupos
    if (isGroupMsg) return;

    // Apenas mensagens de texto
    if (type !== 'chat' || !body || body.trim().length === 0) return;

    console.log(`\n📩 [Mensagem] ${from}: ${body.substring(0, 100)}${body.length > 100 ? '...' : ''}`);

    // Checar limite diário (50 mensagens/dia por usuário)
    const dailyCount = await checkDailyLimit(from);
    if (dailyCount > 50) {
      console.log(`⚠️  [Limite] Usuário ${from} excedeu limite diário`);
      await sendMessage(
        from,
        'Você atingiu o limite diário de mensagens. Por favor, entre em contato via suporte@lawapp.com.br para atendimento prioritário.'
      );
      return;
    }

    // Delay humano (1-3 segundos)
    const delay = Math.random() * 2000 + 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Marcar como "digitando..."
    await setTyping(from, true);

    // Buscar contexto da conversa
    const context = await getConversationContext(from);

    // Salvar mensagem do usuário
    await saveMessageToContext(from, 'user', body);

    // Preparar mensagens para LLM
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...context,
      { role: 'user', content: body }
    ];

    // Chamar LLM
    const llmResponse = await callLLM(messages);

    console.log(`✅ [LLM] Resposta via ${llmResponse.provider}`);
    console.log(`💬 [Resposta] ${llmResponse.content.substring(0, 100)}...`);

    // Salvar resposta do assistente
    await saveMessageToContext(from, 'assistant', llmResponse.content);

    // Limpar "digitando"
    await setTyping(from, false);

    // Enviar resposta
    await sendMessage(from, llmResponse.content);

    console.log(`✅ [Enviado] Resposta para ${from} (${dailyCount}/50 mensagens hoje)`);

  } catch (error) {
    console.error('❌ [Erro]', error.message);

    try {
      await setTyping(from, false);
      await sendMessage(
        from,
        'Desculpe, estou com dificuldades técnicas no momento. 🤖\n\nPor favor:\n• Tente novamente em alguns instantes\n• Ou entre em contato: suporte@lawapp.com.br'
      );
    } catch (sendError) {
      console.error('❌ [Erro] Falha ao enviar mensagem de erro:', sendError.message);
    }
  }
}

// ========================================
// SERVIDOR WEBHOOK
// ========================================

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/webhook/message', async (req, res) => {
  try {
    const { event, data, sessionId } = req.body;

    // Apenas processar eventos de mensagem da sessão configurada
    if (event === 'message' && sessionId === CONFIG.sessionId) {
      // Processar em background (não bloquear webhook)
      processMessage(data).catch(err => {
        console.error('❌ [Processo] Erro ao processar mensagem:', err.message);
      });
    }

    res.json({ status: 'ok', received: true });
  } catch (error) {
    console.error('❌ [Webhook] Erro:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    providers: LLM_PROVIDERS.map(p => p.name),
    redis: redis.status
  });
});

// ========================================
// INICIALIZAÇÃO
// ========================================

async function start() {
  console.log('\n🤖 ============================================');
  console.log('   Chatbot LLM para OpenWA');
  console.log('============================================\n');

  // Verificar provedores LLM
  if (LLM_PROVIDERS.length === 0) {
    console.error('❌ Nenhum provedor LLM configurado!');
    console.error('   Configure pelo menos um:');
    console.error('   - GROQ_API_KEY');
    console.error('   - OPENAI_API_KEY');
    console.error('   - ANTHROPIC_API_KEY');
    process.exit(1);
  }

  console.log('✅ Provedores LLM ativos:', LLM_PROVIDERS.map(p => p.name).join(', '));
  console.log(`✅ Sessão OpenWA: ${CONFIG.sessionId}`);
  console.log(`✅ Redis: ${CONFIG.redis.host}:${CONFIG.redis.port}`);

  // Iniciar servidor
  app.listen(CONFIG.port, () => {
    console.log(`\n🚀 Servidor rodando na porta ${CONFIG.port}`);
    console.log(`   Webhook: http://localhost:${CONFIG.port}/webhook/message`);
    console.log(`   Health: http://localhost:${CONFIG.port}/health`);
    console.log('\n📋 Para registrar o webhook no OpenWA:');
    console.log(`   curl -X POST http://localhost:2785/api/sessions/${CONFIG.sessionId}/webhooks \\`);
    console.log(`     -H "x-api-key: ${CONFIG.openwaKey}" \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"url": "http://localhost:${CONFIG.port}/webhook/message", "events": ["message"], "enabled": true}'`);
    console.log('\n');
  });
}

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ [Fatal] Unhandled rejection:', error);
});

process.on('SIGINT', async () => {
  console.log('\n👋 Encerrando...');
  await redis.quit();
  process.exit(0);
});

start().catch(console.error);
