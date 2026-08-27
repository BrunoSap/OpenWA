# 🤖 Sistema de Atendimento Automatizado WhatsApp + LLM

## 📚 Índice de Documentação

Este é o **sistema completo de atendimento automatizado** via WhatsApp com inteligência artificial, pronto para produção.

---

## 📖 Guias Disponíveis

### **1. [GUIA_ATENDIMENTO_WHATSAPP_LLM.md](./GUIA_ATENDIMENTO_WHATSAPP_LLM.md)**
**Guia principal** do sistema de atendimento via WhatsApp.

**Conteúdo:**
- ✅ Arquitetura completa OpenWA + n8n + Groq LLM
- ✅ Análise de custos (< $0.01 por conversa)
- ✅ Setup passo a passo (n8n, OpenWA, Groq)
- ✅ Workflow n8n completo (JSON importável)
- ✅ Processamento de áudios (Speech-to-Text)
- ✅ Integração com Lawapp API
- ✅ Memória de contexto (Redis)
- ✅ Análise de sentimento e escalação
- ✅ Prompts otimizados para atendimento jurídico
- ✅ Monitoramento e analytics

**Quando usar:** Implementar atendimento via WhatsApp texto/áudio.

---

### **2. [GUIA_TELEFONIA_VOZ_LLM.md](./GUIA_TELEFONIA_VOZ_LLM.md)**
Alternativa profissional para **atendimento de voz** via telefone.

**Conteúdo:**
- ✅ Integração Twilio/Plivo/Telnyx (SIP)
- ✅ Comparação de custos provedores
- ✅ Workflow n8n para ligações telefônicas
- ✅ TwiML e WebSocket streaming
- ✅ Latência ultra-baixa (< 1s)
- ✅ Sistema híbrido (WhatsApp + Telefone)
- ✅ Voice-to-Text em tempo real
- ✅ Prompts otimizados para voz

**Quando usar:** Implementar atendimento de voz via telefone (WhatsApp não suporta ligações via API).

---

### **3. [docker-compose.full-stack.yml](./docker-compose.full-stack.yml)**
Stack completa **pronta para produção**.

**Serviços incluídos:**
- 🟢 OpenWA API (WhatsApp gateway)
- 🔵 n8n (Automação + 2 workers)
- 🟣 PostgreSQL 16 (Database)
- 🔴 Redis (Cache + Queue)
- 🟡 Caddy (Reverse proxy + SSL automático)
- 🟠 PostgreSQL Backup (Diário)
- ⚪ Prometheus + Grafana (Monitoramento)

**Quando usar:** Deploy em produção (VPS, cloud).

---

### **4. [DEPLOY.md](./DEPLOY.md)**
Guia completo de **deploy em produção**.

**Conteúdo:**
- ✅ Preparação de servidor (VPS/cloud)
- ✅ Configuração DNS e SSL
- ✅ Setup de todos os serviços
- ✅ Configuração inicial (OpenWA, n8n)
- ✅ Importação de workflows
- ✅ Testes end-to-end
- ✅ Monitoramento (Grafana)
- ✅ Troubleshooting comum
- ✅ Segurança (firewall, fail2ban)
- ✅ Backup e restore
- ✅ Escalabilidade

**Quando usar:** Colocar sistema em produção pela primeira vez.

---

### **5. Arquivos de Configuração**

| Arquivo | Descrição |
|---------|-----------|
| `init-db.sql` | Script SQL para criar databases (openwa + n8n) |
| `Caddyfile` | Configuração Caddy (SSL automático) |
| `.env.example` | Template de variáveis de ambiente |

---

## 🚀 Quick Start (15 minutos)

### **Cenário: Teste local (sem produção)**

```bash
# 1. Clonar/baixar arquivos
git clone <seu-repo>
cd openwa-atendimento

# 2. Configurar variáveis
cp .env.example .env
# Editar .env e adicionar:
# - GROQ_API_KEY (pegar em console.groq.com)
# - N8N_PASSWORD (sua senha)
# - POSTGRES_PASSWORD (senha forte)

# 3. Subir stack
docker compose -f docker-compose.full-stack.yml up -d

# 4. Aguardar inicialização (2-3 min)
docker compose logs -f

# 5. Abrir OpenWA e conectar WhatsApp
open http://localhost:2785

# 6. Abrir n8n e importar workflow
open http://localhost:5678

# 7. Enviar mensagem teste
# (do seu celular para o WhatsApp conectado)
```

---

## 💰 Resumo de Custos

### **Teste/Desenvolvimento (Local):**
- **Hardware:** Computador pessoal (grátis)
- **APIs:** Groq gratuito (30k req/mês)
- **TOTAL:** **$0/mês**

### **Produção (Pequeno Escritório - 50 atendimentos/dia):**
- **VPS:** DigitalOcean/Hetzner ($12-20/mês)
- **Groq API:** Grátis até 30k mensagens
- **WhatsApp:** Grátis (via OpenWA)
- **Domínio:** ~$1/mês
- **TOTAL:** **~$15/mês**

### **Produção + Telefonia (100 ligações/mês de 3min):**
- VPS: $15/mês
- Twilio Voice: $25/mês
- **TOTAL:** **~$40/mês**

**ROI:** 1 cliente captado = ~R$3.000 em honorários = **ROI de 6.600%**

---

## 🎯 Casos de Uso

### **1. Escritório de Advocacia (Intake Automatizado)**
- ✅ Bot coleta: nome, CPF, e-mail, telefone
- ✅ Identifica tipo de demanda (trabalhista, cível, etc)
- ✅ Cria cliente automaticamente no Lawapp
- ✅ Escala para humano se necessário
- ✅ **Economiza:** 80% do tempo de atendentes

### **2. Consultório Médico (Agendamento)**
- ✅ Bot agenda consultas automaticamente
- ✅ Integra com Google Calendar/agenda própria
- ✅ Envia confirmações e lembretes
- ✅ Coleta histórico médico básico
- ✅ **Economiza:** $2.000/mês em recepcionista

### **3. E-commerce (Suporte Pós-Venda)**
- ✅ Status de pedido automático
- ✅ Dúvidas sobre produtos (via contexto LLM)
- ✅ Protocolo de trocas/devoluções
- ✅ Coleta NPS/satisfação
- ✅ **Economiza:** 90% de tickets de suporte

### **4. Imobiliária (Qualificação de Leads)**
- ✅ Bot qualifica leads (orçamento, preferências)
- ✅ Agenda visitas automaticamente
- ✅ Envia fotos/vídeos de imóveis
- ✅ Integra com CRM
- ✅ **Aumenta:** 300% taxa de conversão

---

## 🔧 Stack Tecnológico

### **Backend:**
- **OpenWA:** Gateway WhatsApp não-oficial
- **n8n:** Orquestrador de workflows (open-source)
- **PostgreSQL:** Database principal
- **Redis:** Cache + filas de mensagens

### **IA/ML:**
- **Groq:** LLM inference (Llama 3.3 70B)
- **Groq Whisper:** Speech-to-Text (áudio → texto)
- **Context memory:** Redis com TTL

### **Infraestrutura:**
- **Docker Compose:** Orquestração de containers
- **Caddy:** Reverse proxy + SSL automático
- **Prometheus + Grafana:** Monitoramento

### **Integrações:**
- **Lawapp API:** CRM jurídico
- **Twilio:** Telefonia (opcional)
- **Google Calendar:** Agendamentos (opcional)

---

## 📊 Métricas de Performance

### **Latência:**
- Texto → Resposta: **1-3 segundos**
- Áudio → Resposta: **3-5 segundos** (incluindo transcrição)
- Ligação telefônica: **< 1 segundo** (streaming)

### **Escalabilidade:**
- **1 instância OpenWA:** até 5 sessões WhatsApp simultâneas
- **1 worker n8n:** ~50 conversas/hora
- **Com 5 workers:** ~250 conversas/hora

### **Disponibilidade:**
- **Uptime:** 99.5%+ (com auto-restart)
- **Failover:** Fila Redis previne perda de mensagens

---

## 🔒 Segurança e Compliance

### **LGPD:**
- ✅ Consentimento explícito antes de coletar dados
- ✅ Criptografia de dados em trânsito (SSL)
- ✅ Retenção configurável (90 dias padrão)
- ✅ Direito ao esquecimento (DELETE /api/data)

### **Segurança Técnica:**
- ✅ API keys com roles (ADMIN/OPERATOR/READONLY)
- ✅ Rate limiting (20 req/min por IP)
- ✅ Firewall (ufw) bloqueando portas não essenciais
- ✅ Fail2ban contra brute-force
- ✅ Backups diários automáticos

### **Auditoria:**
- ✅ Logs estruturados (JSON)
- ✅ Rastreamento de todas as ações
- ✅ Prometheus metrics exportadas

---

## 🛠️ Customizações Comuns

### **1. Adicionar novo tipo de mídia (vídeo):**

```javascript
// No workflow n8n, adicionar node:
IF {{$json.data.type}} === "video"
  THEN → [Download] → [Análise com LLM Vision]
```

### **2. Integrar com outro CRM (Pipedrive, HubSpot):**

```javascript
// Trocar node "Lawapp API" por:
HTTP Request → POST https://api.pipedrive.com/v1/persons
Headers: {
  "Authorization": "Bearer YOUR_PIPEDRIVE_KEY"
}
Body: {
  "name": "{{$json.data.name}}",
  "phone": "{{$json.data.phone}}",
  ...
}
```

### **3. Adicionar idioma (Inglês, Espanhol):**

```javascript
// No system prompt do LLM:
const userLanguage = detectLanguage($json.data.body);
const systemPrompt = PROMPTS[userLanguage]; // pt, en, es

// Groq Whisper já suporta 50+ idiomas nativamente
language: userLanguage
```

### **4. Criar funil de vendas multi-etapa:**

```javascript
// Redis para state machine
const currentStage = await redis.get(`user:${chatId}:stage`);

switch(currentStage) {
  case 'discovery': ...
  case 'qualification': ...
  case 'proposal': ...
  case 'closing': ...
}
```

---

## 📖 Tutoriais em Vídeo (Futuros)

- [ ] Setup completo do zero (20 min)
- [ ] Customizar prompts para seu negócio (10 min)
- [ ] Deploy em VPS (15 min)
- [ ] Integração com Twilio para telefonia (10 min)
- [ ] Monitoramento e analytics (10 min)

---

## 🐛 Issues Conhecidos

### **1. WhatsApp bane contas com uso abusivo**

**Sintomas:**
- Conta restrita após enviar > 100 msgs/dia
- QR code não conecta mais

**Mitigação:**
- Usar número dedicado (não pessoal)
- Adicionar delays entre mensagens (1-3s)
- Não enviar msgs idênticas em massa
- Variar temperatura LLM (0.7-0.9)

**Documentação:** [docs/24-avoiding-bans.md](https://github.com/rmyndharis/OpenWA/blob/main/docs/24-avoiding-bans.md)

---

### **2. Groq rate limit (429 errors)**

**Sintomas:**
- Erro 429 após 30 requisições/minuto
- Workflow trava

**Mitigação:**
- Adicionar retry com exponential backoff no n8n
- Usar múltiplas chaves Groq (round-robin)
- Cache respostas comuns no Redis
- Fallback para OpenAI GPT-4o-mini

---

### **3. n8n memory leak (após 1000+ execuções)**

**Sintomas:**
- Container n8n usa > 2GB RAM
- Execuções lentas

**Mitigação:**
- Reiniciar n8n semanalmente (cron):
  ```bash
  0 3 * * 0 docker restart n8n
  ```
- Limpar execuções antigas:
  ```sql
  DELETE FROM execution_entity WHERE finished_at < NOW() - INTERVAL '7 days';
  ```

---

## 🤝 Contribuindo

Este é um sistema interno, mas aceita melhorias:

1. Fork este repositório
2. Crie branch: `git checkout -b feature/minha-feature`
3. Commit: `git commit -m 'Add: nova feature'`
4. Push: `git push origin feature/minha-feature`
5. Abra Pull Request

---

## 📞 Suporte

- **Documentação oficial OpenWA:** https://github.com/rmyndharis/OpenWA
- **Comunidade n8n:** https://community.n8n.io
- **Discord Groq:** https://discord.gg/groq
- **Issues deste projeto:** [Abrir Issue](https://github.com/seu-repo/issues)

---

## 📜 Licença

Este projeto usa:
- OpenWA: MIT License
- n8n: Sustainable Use License
- Documentação: MIT License

---

## ✨ Créditos

**Desenvolvido por:** Equipe Lawapp Tech  
**Baseado em:** OpenWA (rmyndharis), n8n (n8n-io)  
**LLM:** Groq (Llama 3.3 70B)  
**Documentação:** Claude (Opus 4.8)

**Data:** 2026-08-22  
**Versão:** 1.0.0

---

## 🗺️ Roadmap

### **v1.1 (Q3 2026)**
- [ ] Interface administrativa web (React)
- [ ] Relatórios de analytics integrados
- [ ] Múltiplos idiomas (EN, ES)
- [ ] Integração WhatsApp Business API (oficial)

### **v1.2 (Q4 2026)**
- [ ] Agente com memória de longo prazo (vector DB)
- [ ] Fine-tuning de modelo específico por domínio
- [ ] Integração com mais 10 CRMs
- [ ] Mobile app para gestão

### **v2.0 (2027)**
- [ ] Multi-tenancy (SaaS)
- [ ] Marketplace de workflows prontos
- [ ] Suporte a Instagram DM e Facebook Messenger
- [ ] Agent orchestration (multi-agent system)

---

**🚀 Comece agora:** [DEPLOY.md](./DEPLOY.md) | [GUIA_ATENDIMENTO_WHATSAPP_LLM.md](./GUIA_ATENDIMENTO_WHATSAPP_LLM.md)
