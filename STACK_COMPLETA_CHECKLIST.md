# 📋 Checklist: Stack Production Completa

## ✅ Containers Ativos (Via Dashboard OpenWA)

Você **já habilitou** via dashboard do OpenWA:

| Container | Status | Origem | Porta |
|-----------|--------|--------|-------|
| **openwa-api** | ✅ Rodando | docker-compose.yml | 2785 |
| **openwa-postgres** | ✅ Rodando | Criado pelo OpenWA | 5432 |
| **openwa-redis** | ✅ Rodando | Criado pelo OpenWA | 6379 |
| **openwa-docker-proxy** | ✅ Rodando | docker-compose.yml | - |

**Total:** 4 containers ativos

---

## ❌ Containers Production Faltando

Baseado no `docker-compose.full-stack.yml`, faltam:

### 1️⃣ **n8n** (Workflow Automation)
**Status:** ❌ Não instalado  
**Função:** Orquestração visual de workflows  
**Necessário para:** Automatizar fluxos complexos via interface gráfica

**Alternativa:** ✅ **Webhook LLM Handler** (Node.js script)
- Mais leve
- Sem UI (mas mais direto)
- Usa Redis do OpenWA
- Código criado: `webhook-llm-handler.js`

---

### 2️⃣ **Caddy** (Reverse Proxy + SSL)
**Status:** ❌ Não instalado  
**Função:** Proxy reverso com SSL automático (Let's Encrypt)  
**Necessário para:** 
- Expor OpenWA com HTTPS
- Domínio customizado (ex: `api.lawapp.com.br`)
- Rate limiting externo

**Quando instalar:** Apenas em **produção externa** (servidor público)

**Como instalar:**
```bash
# Adicionar ao docker-compose.yml
docker compose up -d caddy
```

---

### 3️⃣ **Prometheus + Grafana** (Monitoring)
**Status:** ❌ Não instalado  
**Função:** Métricas e dashboards de monitoramento  
**Necessário para:**
- Ver uso de CPU/RAM/Disk
- Latência das APIs
- Taxa de mensagens/segundo
- Alertas de downtime

**Quando instalar:** Após validar que tudo funciona

**Como instalar:**
```bash
# Criar arquivo prometheus.yml
docker compose -f docker-compose.full-stack.yml up -d prometheus grafana
```

**Acessar:**
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (admin/admin)

---

### 4️⃣ **pg-backup** (Backup PostgreSQL)
**Status:** ❌ Não instalado  
**Função:** Backup automático diário do PostgreSQL  
**Necessário para:** Disaster recovery

**Quando instalar:** Antes de ir para produção

**Como instalar:**
```bash
docker compose -f docker-compose.full-stack.yml up -d pg-backup
```

**Configuração:**
- Backups diários às 3h AM
- Retém: 7 dias + 4 semanas + 6 meses

---

## 🎯 Prioridade de Instalação

### ✅ **Fase 1: MVP (ATUAL)**
Você JÁ TEM:
- ✅ OpenWA API rodando
- ✅ PostgreSQL (gerenciado pelo OpenWA)
- ✅ Redis (gerenciado pelo OpenWA)
- ✅ Sessão WhatsApp conectada

**Próximo passo:** Configurar chatbot LLM

---

### 🔄 **Fase 2: Automação (PRÓXIMO)**
Escolher **UM** dos dois:

**Opção A: Webhook Handler (RECOMENDADO para você)**
```bash
chmod +x setup-chatbot.sh
./setup-chatbot.sh
node webhook-llm-handler.js
```

**Opção B: n8n (se preferir UI visual)**
```bash
docker compose -f docker-compose.full-stack.yml up -d n8n
# Acessar http://localhost:5678
```

---

### 📊 **Fase 3: Monitoramento (DEPOIS DE FUNCIONAR)**
```bash
# 1. Criar prometheus.yml
cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'openwa'
    static_configs:
      - targets: ['openwa-api:2785']
EOF

# 2. Iniciar monitoring
docker compose -f docker-compose.full-stack.yml up -d prometheus grafana
```

---

### 🔒 **Fase 4: Produção (ÚLTIMO)**
```bash
# 1. Backup automático
docker compose -f docker-compose.full-stack.yml up -d pg-backup

# 2. SSL + Reverse Proxy
# Editar Caddyfile com seu domínio
docker compose -f docker-compose.full-stack.yml up -d caddy
```

---

## 🚀 Comando Rápido: Stack Completa

Se quiser subir **TUDO de uma vez** (não recomendado, melhor ir por fases):

```bash
# 1. Parar stack atual
docker compose down

# 2. Usar full-stack.yml
docker compose -f docker-compose.full-stack.yml up -d

# 3. Acessar serviços
# OpenWA: http://localhost:2785
# n8n: http://localhost:5678
# Grafana: http://localhost:3000
# Prometheus: http://localhost:9090
```

---

## 🔍 Verificar o que está rodando

```bash
# Ver todos os containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Ver uso de recursos
docker stats --no-stream

# Ver projetos compose
docker compose ls
```

---

## ❓ Qual é a sua necessidade?

### Se você quer:

**1. "Só quero chatbot LLM funcionando AGORA"**
→ Use Fase 1 (atual) + Fase 2 Opção A (webhook handler)
→ Total: 4 containers (os que já tem)

**2. "Quero ver workflows visualmente"**
→ Adicione n8n (Fase 2 Opção B)
→ Total: 5 containers

**3. "Quero monitorar tudo com dashboards"**
→ Adicione Prometheus + Grafana (Fase 3)
→ Total: 6-7 containers

**4. "Quero preparar para produção real"**
→ Adicione tudo (Fases 1-4)
→ Total: 9 containers

---

## 💡 Recomendação

Para você agora:

1. ✅ **Manter stack atual** (4 containers do OpenWA)
2. 🔄 **Configurar Webhook LLM Handler** (sem adicionar containers)
3. 🧪 **Testar chatbot** enviando mensagens
4. 📊 **Depois** adicionar monitoring se precisar

**Por quê?**
- Menor footprint (menos RAM/CPU)
- Mais rápido para debugar
- OpenWA já gerencia Postgres + Redis
- Webhook handler é suficiente para chatbot

---

## 🎬 Próxima Ação Sugerida

```bash
# 1. Configurar Groq API key
echo "GROQ_API_KEY=gsk_YOUR_KEY_HERE" >> .env

# 2. Rodar setup
chmod +x setup-chatbot.sh
./setup-chatbot.sh

# 3. Iniciar chatbot
node webhook-llm-handler.js

# 4. Testar
# Enviar mensagem WhatsApp para +1 (321) 488-5868
```

---

**Status:** Stack MVP completa | Chatbot pronto para configurar | Monitoring opcional
