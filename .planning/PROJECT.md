# OpenWA - WhatsApp Automation Platform

## Visão Geral

OpenWA é uma plataforma completa de automação WhatsApp com inteligência artificial (LLM), suporte multimodal e orquestração n8n. Permite criar bots inteligentes de atendimento 24/7 com processamento de texto, áudio (STT), imagem (Vision) e integração com base de conhecimento (RAG).

## Objetivo do Projeto

Fornecer uma API REST completa para automação WhatsApp que seja:
- **Fácil de usar**: Setup em < 5 minutos com Docker
- **Escalável**: Suporta de 1 a 10+ sessões simultâneas
- **Flexível**: Arquitetura plugável (SQLite↔PostgreSQL, Local↔S3, etc)
- **Inteligente**: Integração nativa com LLMs (Groq, OpenAI) e RAG
- **Production-ready**: Monitoring, backups, autenticação API key

## Domínio de Negócio

- **Tipo**: Plataforma de automação / API de mensageria
- **Usuários finais**: Desenvolvedores, empresas, agências
- **Casos de uso principais**:
  - Atendimento ao cliente automatizado com AI
  - Bot de qualificação de leads (intake)
  - Suporte técnico com base de conhecimento
  - Automação de vendas e notificações
  - Integrações com n8n/Zapier

## Stack Tecnológica

### Backend
- **Runtime**: Node.js 22 LTS
- **Framework**: NestJS (TypeScript)
- **WhatsApp Engine**: @open-wa/wa-automate (plugável: whatsapp-web.js ou Baileys)
- **Database**: PostgreSQL 16 + pgvector (ou SQLite para dev/pequeno porte)
- **Cache**: Redis 7
- **Queue**: BullMQ
- **Automation**: n8n (workers + queue mode)

### Infraestrutura
- **Container**: Docker + Docker Compose
- **Storage**: Local filesystem ou S3/MinIO
- **Monitoring**: Prometheus + Grafana + Loki
- **Proxy**: Nginx (opcional)

### AI/LLM
- **LLM Provider**: Groq (free, padrão) / OpenAI (fallback)
- **Multimodal**: Groq Whisper (STT), OpenAI Vision (imagens)
- **RAG**: pgvector (embeddings) + PostgreSQL

## Arquitetura

### Padrão Arquitetural
- **Layers**: Presentation (REST/WebSocket) → Application (Services) → Domain (Entities) → Infrastructure (DB/Engine/Storage)
- **Modules**: 31+ feature modules NestJS (session, message, webhook, auth, integration, automation, etc)
- **Engine Abstraction**: `IWhatsAppEngine` interface com adapters plugáveis (Strategy Pattern)
- **Pluggable Infrastructure**: Database (sqlite|postgres), Storage (local|s3), Cache (redis|disabled)

### Componentes Principais
1. **Session Manager** - Gerencia ciclo de vida das sessões WhatsApp (criar, autenticar QR, reconectar)
2. **Message Manager** - Processa mensagens (inbound/outbound), fila de envio, validação
3. **Webhook Manager** - Despacha eventos para URLs externas com retry exponencial
4. **Integration Fabric** - Sistema de plugins para integrações externas (n8n, MCP, etc)
5. **Automation Rules** - Regras de auto-resposta baseadas em condições

### Fluxo de Dados
```
WhatsApp → OpenWA Engine → n8n Workflow → [LLM + RAG] → Response → WhatsApp
              ↓                  ↓
        PostgreSQL          Redis (cache)
        (pgvector)
```

## Estado Atual do Projeto

### Fase Implementada
✅ **MVP + Production-ready**

### Funcionalidades Implementadas
- ✅ Multi-session WhatsApp (múltiplas contas simultâneas)
- ✅ LLM Integration (Groq Mixtral, OpenAI GPT-4)
- ✅ Multimodal (texto + áudio STT + imagem Vision)
- ✅ Knowledge Base RAG com pgvector
- ✅ Context Memory (Redis para histórico de conversas)
- ✅ n8n Automation (workflows low-code)
- ✅ API REST completa + WebSocket real-time
- ✅ Dashboard web UI
- ✅ API Key authentication + IP whitelist
- ✅ Bulk messaging com delays anti-ban
- ✅ Webhook system com retry
- ✅ Docker + docker-compose para deploy
- ✅ Monitoring (Prometheus/Grafana/Loki)
- ✅ Documentação consolidada (ARCHITECTURE, SETUP, GUIDES, WORKFLOWS, TROUBLESHOOTING)

### Estrutura de Documentação
Toda documentação foi consolidada em 6 arquivos temáticos:
- `README.md` - Quick start e overview
- `docs/ARCHITECTURE.md` - Arquitetura global, sistema plugável, engine abstraction
- `docs/SETUP.md` - Instalação, configuração, deploy, plugins
- `docs/GUIDES.md` - Atendimento WhatsApp+LLM, telefonia, multimodal, KB
- `docs/WORKFLOWS.md` - n8n workflows, importação, troubleshooting
- `docs/TROUBLESHOOTING.md` - Bugs corrigidos, problemas comuns, recovery
- `docs/archive/` - 52 documentos originais preservados

## Próximos Passos

### Roadmap Futuro
- [ ] Long-term memory persistente
- [ ] Integração telefonia (VibeVoice)
- [ ] Dashboard analytics avançado
- [ ] Multi-tenant support
- [ ] API pública com rate limiting por tenant
- [ ] Horizontal scaling (multi-replica + load balancer)

### Melhorias de Qualidade
- [ ] Aumentar cobertura de testes (atual: básica)
- [ ] Adicionar testes E2E com Playwright
- [ ] CI/CD pipeline completo
- [ ] Documentação de API com exemplos interativos

## Equipe e Contato

- **Desenvolvedor Principal**: Bruno Ricciardi
- **Repositório**: https://github.com/your-org/openwa (ajustar URL)
- **Issues**: GitHub Issues
- **Discussões**: GitHub Discussions

## Licença

[LICENSE] - Ajustar conforme necessário
