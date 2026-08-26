# OpenWA - WhatsApp Automation Platform

Sistema completo de automação WhatsApp com inteligência artificial (LLM), suporte multimodal e orquestração n8n.

![OpenWA Banner](docs/logo/banner.png)

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/your-org/openwa.git
cd openwa

# Configure
cp .env.example .env
nano .env  # Configure suas chaves

# Start
docker-compose up -d

# Acesse
http://localhost:3000  # OpenWA
http://localhost:5678  # n8n
```

## 📚 Documentação

Toda a documentação foi consolidada em arquivos temáticos:

| Documento | Conteúdo |
|-----------|----------|
| **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Arquitetura global, Unified Bot, Bot de Intake, análise de gaps |
| **[SETUP.md](docs/SETUP.md)** | Instalação, configuração, deploy, plugins, stack completa |
| **[GUIDES.md](docs/GUIDES.md)** | Atendimento WhatsApp + LLM, telefonia/voz, multimodal, KB, system prompts |
| **[WORKFLOWS.md](docs/WORKFLOWS.md)** | Importar workflows n8n, workflows disponíveis, migração, troubleshooting |
| **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** | Bugs corrigidos, problemas comuns, logs, recovery |
| **[CHANGELOG.md](CHANGELOG.md)** | Histórico completo de versões e mudanças |

### 📂 Documentação Original (Arquivo)

Todos os documentos originais foram preservados em [`docs/archive/`](docs/archive/) para referência histórica.

## ✨ Funcionalidades

- ✅ **Multi-Session WhatsApp** - Múltiplas contas simultaneamente
- ✅ **LLM Integration** - Groq (Mixtral), OpenAI (GPT-4)
- ✅ **Multimodal** - Texto + Áudio (STT) + Imagem (Vision)
- ✅ **Knowledge Base** - RAG com pgvector
- ✅ **Context Memory** - Redis para histórico de conversas
- ✅ **n8n Automation** - Workflows low-code
- ✅ **Production Ready** - Docker, monitoring, backups

## 🏗️ Arquitetura

```
WhatsApp → OpenWA → n8n → [LLM + RAG] → Response
              ↓           ↓
        PostgreSQL    Redis
        (pgvector)   (cache)
```

**Stack:**
- **Backend:** Node.js + NestJS
- **WhatsApp:** @open-wa/wa-automate
- **Automation:** n8n (workers + queue)
- **Database:** PostgreSQL 16 + pgvector
- **Cache:** Redis 7
- **LLM:** Groq (free), OpenAI (fallback)
- **Monitoring:** Prometheus + Grafana + Loki

## 🎯 Casos de Uso

1. **Atendimento ao Cliente** - Bot inteligente 24/7
2. **Lead Qualification** - Bot de intake automatizado
3. **Suporte Técnico** - Base de conhecimento + AI
4. **Vendas** - Catálogo, pedidos, pagamento
5. **Notificações** - Alertas, lembretes, campanhas

## 🔧 Requisitos

**Mínimo:**
- Docker & Docker Compose
- 4GB RAM
- 20GB disco

**Recomendado (produção):**
- VPS 8GB RAM / 4 vCPU
- 50GB disco SSD
- Ubuntu 22.04+

## 🌐 Deploy

### Desenvolvimento
```bash
docker-compose up -d
```

### Produção
```bash
docker-compose -f docker-compose.prod.yml up -d
```

Ver [SETUP.md](docs/SETUP.md#deploy) para instruções completas de deploy em VPS.

## 📖 Começando

1. **[Instalar](docs/SETUP.md#instalação)** - Setup Docker
2. **[Configurar](docs/SETUP.md#configuração)** - API keys, credenciais
3. **[Conectar WhatsApp](docs/SETUP.md#1-configuração-openwa)** - QR code scan
4. **[Importar Workflow](docs/WORKFLOWS.md#importar)** - n8n workflow
5. **[Popular KB](docs/GUIDES.md#knowledge-base)** - Base de conhecimento
6. **[Testar](docs/GUIDES.md#implementação-passo-a-passo)** - End-to-end test

## 🛠️ Workflows Disponíveis

| Workflow | Texto | Áudio | Imagem | RAG | Produção |
|----------|-------|-------|--------|-----|----------|
| **Unified Multimodal** | ✅ | ✅ | ✅ | ✅ | ✅ Recomendado |
| Unified Bot FIXED | ✅ | ❌ | ❌ | ✅ | ⚠️ Parcial |
| LLM Bot MELHORADO | ✅ | ❌ | ❌ | ❌ | ❌ MVP apenas |
| Audio Transcription | ❌ | ✅ | ❌ | ❌ | 🔧 Utility |

Ver [WORKFLOWS.md](docs/WORKFLOWS.md#workflows-disponíveis) para detalhes.

## 🧪 Testing

### RAG E2E Tests

Testes end-to-end para validar o ciclo completo RAG (Retrieval-Augmented Generation):

```bash
# Run all RAG E2E tests
npm run test:e2e:rag

# Run with watch mode
npm run test:e2e:rag:watch

# Run Python RAG metrics (requires PostgreSQL with seeded fixtures)
python3 database/tests/validate_rag_retrieval.py
```

**Test coverage:**
- ✅ RAG-01: WhatsApp message triggers RAG pipeline
- ✅ RAG-02: pgvector similarity search (score >= 0.8)
- ✅ RAG-03: LLM uses KB context (LLM-as-judge validation)
- ✅ RAG-04: Exact match query
- ✅ RAG-05: Fuzzy semantic search
- ✅ RAG-06: Fallback for no-match queries
- ✅ RAG-07: Latency < 3000ms (p95)
- ✅ RAG-08: Precision@k >= 0.8
- ✅ RAG-09: Automated CI/CD execution

**CI/CD:**

RAG tests run automatically on PRs via GitHub Actions:

[![RAG E2E Tests](https://github.com/your-org/openwa/actions/workflows/rag-e2e.yml/badge.svg)](https://github.com/your-org/openwa/actions/workflows/rag-e2e.yml)

**Requirements:**
- PostgreSQL 16+ with pgvector extension
- Test fixtures seeded: `psql -f database/tests/fixtures/seed_test_faq.sql`
- Environment variables: `GROQ_API_KEY`, `OPENAI_API_KEY` (for LLM-as-judge)

## 🐛 Troubleshooting

**Problemas comuns:**

- Container não inicia → [Ver solução](docs/TROUBLESHOOTING.md#container-não-inicia)
- QR code não aparece → [Ver solução](docs/TROUBLESHOOTING.md#whatsapp-qr-code-não-aparece)
- Mensagens não chegam → [Ver solução](docs/TROUBLESHOOTING.md#mensagens-não-chegam-no-webhook)
- Respostas lentas → [Ver solução](docs/TROUBLESHOOTING.md#llm-responses-muito-lentas)

Ver [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) completo.

## 🔐 Segurança

- ✅ API Key authentication
- ✅ Rate limiting
- ✅ Input sanitization
- ✅ TLS encryption
- ✅ Secrets management (.env)

Ver [SECURITY.md](SECURITY.md) para política completa.

## 📊 Monitoramento

**Dashboards Grafana:**
```
http://localhost:3001
```

**Métricas:**
- Taxa de mensagens processadas
- Latência LLM
- Taxa de erro
- Uso de recursos

Ver [SETUP.md - Monitoramento](docs/SETUP.md#monitoramento).

## 💰 Custos

**Estimativa mensal:**
- VPS 8GB: $35-50
- Groq API: $0 (free tier)
- OpenAI (fallback): $10-30
- Domínio: $1/mês
- **Total: ~$45-80/mês**

## 🤝 Contribuindo

Contribuições são bem-vindas! Ver [CONTRIBUTING.md](CONTRIBUTING.md).

## 📝 Licença

[LICENSE](LICENSE)

## 🆘 Suporte

- 📖 [Documentação](docs/)
- 🐛 [Issues](https://github.com/your-org/openwa/issues)
- 💬 [Discussions](https://github.com/your-org/openwa/discussions)

## 🙏 Créditos

Construído com:
- [@open-wa/wa-automate](https://github.com/open-wa/wa-automate-nodejs)
- [n8n](https://n8n.io)
- [Groq](https://groq.com)
- [OpenAI](https://openai.com)
- [Supabase](https://supabase.com)

## ⭐ Roadmap

- [ ] Long-term memory persistente
- [ ] Integração telefonia (VibeVoice)
- [ ] Dashboard analytics
- [ ] Multi-tenant support
- [ ] API pública

---

**Feito com ❤️ para automação WhatsApp inteligente**
