# Setup e Configuração OpenWA

Guia completo de instalação, configuração e deploy do sistema OpenWA.

## Índice
1. [Instalação](#instalação)
2. [Configuração](#configuração)
3. [Deploy](#deploy)
4. [Plugins](#plugins)
5. [Stack Completa](#stack-completa)

---

## Instalação

### Pré-requisitos

- Docker & Docker Compose
- Node.js 18+ (para desenvolvimento local)
- Git
- Mínimo 4GB RAM (8GB recomendado)

### Quick Start

```bash
# Clone o repositório
git clone https://github.com/your-org/openwa.git
cd openwa

# Copie o exemplo de variáveis de ambiente
cp .env.example .env

# Configure suas credenciais no .env
nano .env

# Inicie os serviços
docker-compose up -d

# Verifique os logs
docker-compose logs -f
```

### Variáveis de Ambiente Essenciais

```bash
# OpenWA
OPENWA_API_KEY=your_secret_key_here
OPENWA_SESSION_NAME=default

# Database
POSTGRES_PASSWORD=your_postgres_password
DATABASE_URL=postgresql://postgres:password@postgres:5432/openwa

# Redis
REDIS_PASSWORD=your_redis_password

# LLM Providers
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key

# n8n
N8N_ENCRYPTION_KEY=generate_with_openssl
N8N_WEBHOOK_URL=https://your-domain.com/webhook
```

**Gerar chaves seguras:**
```bash
# N8N encryption key
openssl rand -hex 32

# API key
openssl rand -base64 32
```

---

## Configuração

### 1. Configuração OpenWA

**API Key Bootstrap**

Ao iniciar pela primeira vez, o OpenWA gera automaticamente uma API key em `/app/data/api-key.txt`.

```bash
# Obter a API key gerada
docker exec openwa cat /app/data/api-key.txt

# Ou via logs
docker logs openwa 2>&1 | grep "API Key"
```

**Configurar sessões WhatsApp**

1. Acesse `http://localhost:3000`
2. Login com API key obtida acima
3. Clique em "Start New Session"
4. Escaneie QR code com WhatsApp
5. Sessão ficará ativa

**Arquivo de configuração:**
```json
{
  "sessionName": "default",
  "multiDevice": true,
  "autoReconnect": true,
  "qrTimeout": 60,
  "markMessagesRead": false,
  "logLevel": "info"
}
```

### 2. Configuração n8n

**Primeiro acesso:**

```bash
# n8n UI
http://localhost:5678

# Crie uma conta admin na primeira vez
```

**Configuração de credenciais:**

1. **OpenWA Credential**
   - Type: Custom API
   - URL: `http://openwa:3000`
   - API Key: (usar a key obtida anteriormente)

2. **Groq Credential**
   - Type: HTTP Request
   - Authentication: Bearer Token
   - Token: `$GROQ_API_KEY`

3. **PostgreSQL Credential**
   - Host: `postgres`
   - Port: `5432`
   - Database: `openwa`
   - User: `postgres`
   - Password: (do .env)

**Workers:**

Para escalar, adicione workers no docker-compose:

```yaml
n8n-worker-1:
  image: n8nio/n8n
  environment:
    - EXECUTIONS_MODE=queue
    - QUEUE_BULL_REDIS_HOST=redis
  depends_on:
    - redis
    - n8n

n8n-worker-2:
  # mesma config
```

### 3. Configuração Base de Conhecimento

**Supabase (recomendado):**

```bash
# Variáveis no .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Schema PostgreSQL:**

```sql
-- Criar extensão de vetores
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela de conhecimento
CREATE TABLE knowledge_base (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índice para busca vetorial
CREATE INDEX ON knowledge_base USING ivfflat (embedding vector_cosine_ops);
```

**Popular base:**

```bash
# Via script
node scripts/populate-kb.js --file data/knowledge.json

# Via n8n workflow
# Importar: alimentar-conhecimento.md
```

### 4. Configuração Completa Checklist

Arquivo de verificação passo-a-passo: ver `archive/STACK_COMPLETA_CHECKLIST.md`

**Resumo:**
- [ ] Docker instalado e rodando
- [ ] Variáveis de ambiente configuradas
- [ ] OpenWA iniciado e API key obtida
- [ ] Sessão WhatsApp conectada
- [ ] n8n acessível e credenciais configuradas
- [ ] PostgreSQL conectado
- [ ] Redis funcionando
- [ ] Base de conhecimento populada
- [ ] Workflow importado
- [ ] Teste end-to-end realizado

---

## Deploy

### Docker Compose (Produção)

**Arquivo:** `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  openwa:
    image: openwa/openwa:latest
    restart: always
    environment:
      NODE_ENV: production
    volumes:
      - openwa_data:/app/data
    networks:
      - openwa_network

  n8n:
    image: n8nio/n8n:latest
    restart: always
    environment:
      EXECUTIONS_MODE: queue
      N8N_METRICS: true
    volumes:
      - n8n_data:/home/node/.n8n
    networks:
      - openwa_network

  postgres:
    image: pgvector/pgvector:pg16
    restart: always
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - openwa_network

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    networks:
      - openwa_network

  caddy:
    image: caddy:2-alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - openwa_network

volumes:
  openwa_data:
  n8n_data:
  postgres_data:
  redis_data:
  caddy_data:
  caddy_config:

networks:
  openwa_network:
    driver: bridge
```

**Caddyfile (HTTPS automático):**

```
your-domain.com {
    reverse_proxy openwa:3000
}

n8n.your-domain.com {
    reverse_proxy n8n:5678
}
```

**Deploy:**

```bash
# Build e start
docker-compose -f docker-compose.prod.yml up -d

# Verificar status
docker-compose -f docker-compose.prod.yml ps

# Logs
docker-compose -f docker-compose.prod.yml logs -f
```

### VPS (8GB RAM, 4 vCPU)

**Provedores recomendados:**
- DigitalOcean ($48/mês)
- Hetzner ($35/mês)
- Vultr ($48/mês)

**Setup inicial:**

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo apt install docker-compose-plugin

# Clone projeto
git clone https://github.com/your-org/openwa.git
cd openwa

# Configure .env
cp .env.example .env
nano .env

# Start
docker-compose -f docker-compose.prod.yml up -d
```

**Firewall:**

```bash
# UFW
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

**Monitoramento:**

```bash
# Health checks
curl http://localhost:3000/health
curl http://localhost:5678/healthz

# Logs
docker-compose logs -f --tail=100
```

### Backup

**Script de backup automático:**

```bash
#!/bin/bash
BACKUP_DIR="/backups/openwa"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup PostgreSQL
docker exec postgres pg_dump -U postgres openwa > $BACKUP_DIR/db_$DATE.sql

# Backup volumes
docker run --rm -v openwa_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/openwa_data_$DATE.tar.gz /data
docker run --rm -v n8n_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/n8n_data_$DATE.tar.gz /data

# Limpar backups antigos (>7 dias)
find $BACKUP_DIR -mtime +7 -delete
```

**Cron:**

```bash
# Diário às 3h
0 3 * * * /path/to/backup.sh
```

---

## Plugins

### n8n Plugins

**Instalar plugin via Docker:**

Método 1: **Volume mount (desenvolvimento)**

```yaml
n8n:
  volumes:
    - ./custom-nodes:/home/node/.n8n/custom
```

Método 2: **Docker build (produção)**

```dockerfile
FROM n8nio/n8n

# Instalar plugin
RUN cd /usr/local/lib/node_modules/n8n && \
    npm install @rmyndharis/n8n-nodes-openwa
```

```bash
# Build imagem customizada
docker build -t n8n-openwa .

# Use no docker-compose
image: n8n-openwa:latest
```

Método 3: **Runtime (teste apenas, não persiste)**

```bash
docker exec -it n8n sh
npm install -g @rmyndharis/n8n-nodes-openwa
exit
docker restart n8n
```

**Plugin OpenWA:**

```bash
# Via npm
npm install @rmyndharis/n8n-nodes-openwa

# Ou via GitHub
cd /home/node/.n8n/custom
git clone https://github.com/rmyndharis/OpenWA-plugins.git
cd OpenWA-plugins
npm install
npm run build
```

**Verificar instalação:**

1. Reinicie n8n
2. No editor, procure por "OpenWA" nos nodes
3. Deve aparecer: "OpenWA - Send Message", "OpenWA - Trigger", etc.

### Resolver Erro 404 de Plugin

**Problema:** `unable to get local issuer certificate`

**Causa:** Docker container sem certificados SSL

**Solução:**

Adicione ao Dockerfile:

```dockerfile
FROM n8nio/n8n

# Instalar certificados CA
RUN apk add --no-cache ca-certificates

# Atualizar certificados
RUN update-ca-certificates
```

Rebuild:

```bash
docker-compose down
docker-compose build n8n
docker-compose up -d
```

Detalhes completos: ver `archive/FIX_PLUGIN_404.md`

---

## Stack Completa

### Arquitetura Full Stack

```
┌─────────────┐
│  WhatsApp   │
└──────┬──────┘
       │
┌──────▼──────┐
│   OpenWA    │ (:3000)
└──────┬──────┘
       │
┌──────▼──────┐
│     n8n     │ (:5678)
│  + workers  │
└──────┬──────┘
       │
   ┌───┴───┐
   │       │
┌──▼───┐ ┌─▼─────┐
│ LLM  │ │  KB   │
│Groq/ │ │Supa-  │
│OpenAI│ │ base  │
└──────┘ └───┬───┘
             │
      ┌──────▼──────┐
      │  PostgreSQL │ (:5432)
      │  + pgvector │
      └─────────────┘
```

**Monitoring Stack:**

```
┌─────────────┐
│ Prometheus  │ (:9090) - Métricas
└──────┬──────┘
       │
┌──────▼──────┐
│   Grafana   │ (:3001) - Dashboards
└─────────────┘

┌─────────────┐
│    Loki     │ (:3100) - Logs
└─────────────┘
```

### Recursos Necessários

**Mínimo (desenvolvimento):**
- 4GB RAM
- 2 vCPU
- 20GB disco

**Recomendado (produção):**
- 8GB RAM
- 4 vCPU
- 50GB disco SSD

**Alta disponibilidade:**
- 16GB RAM
- 8 vCPU
- 100GB disco SSD
- Load balancer
- Multi-region

### Custos Estimados

| Item | Custo Mensal |
|------|--------------|
| VPS 8GB | $35-50 |
| Groq API | $0 (free tier suficiente) |
| OpenAI (fallback) | $10-30 |
| Domínio | $12/ano |
| **Total** | **$45-80/mês** |

---

## Grafana Analytics Dashboard

Dashboard de visualização de métricas operacionais consumindo os endpoints de analytics (Phase 6) via Grafana auto-provisionado.

### Pré-requisitos

Antes de iniciar o Grafana, configure as seguintes variáveis de ambiente no arquivo `.env`:

**1. GRAFANA_PASSWORD** - Senha do admin do Grafana (padrão: `admin` se não definida)

```bash
GRAFANA_PASSWORD=sua_senha_segura_aqui
```

**2. OPERATOR_API_KEY** - Chave de API com role OPERATOR para autenticar as chamadas ao endpoint `/api/analytics/*`

Para criar uma chave OPERATOR:

1. Acesse o dashboard OpenWA em http://localhost:2785
2. Navegue até a página **API Keys**
3. Clique em **Create API Key**
4. Selecione role **OPERATOR**
5. Copie o valor da chave gerada
6. Adicione ao `.env`:

```bash
OPERATOR_API_KEY=sua_chave_operator_aqui
```

### Iniciar Grafana

```bash
# Inicie Grafana + Prometheus + OpenWA API com profile monitoring
docker compose -f docker-compose.full-stack.yml --profile monitoring up -d grafana prometheus openwa-api
```

### Acessar Dashboard

1. Abra o navegador em **http://localhost:3000**
2. Login:
   - **Usuário:** `admin`
   - **Senha:** valor de `${GRAFANA_PASSWORD}` (padrão: `admin`)
3. Navegue até **Dashboards → OpenWA Analytics Overview**

### O que é Auto-Provisionado

Ao iniciar o Grafana, os seguintes recursos são criados automaticamente (sem configuração manual):

**Datasources:**
- **Prometheus** - Conecta em `http://prometheus:9090` para métricas de infraestrutura
- **OpenWA Analytics API** - Conecta em `http://openwa-api:2785/api/analytics` com autenticação via `Authorization: Bearer ${OPERATOR_API_KEY}`

**Dashboard:**
- **OpenWA Analytics Overview** - 4 painéis principais:
  1. **Overview KPIs** - Taxa de resolução, fallback rate, custo por conversa, DAU, MAU
  2. **Performance** - Latências p50/p95/p99 (API + Prometheus histogram)
  3. **Cost** - Breakdown de custo por feature + total
  4. **Conversations** - Lista de conversas com métricas individuais
  5. **Alerts** - Alertas ativos do Prometheus (`prometheus/alerts.yml`)

### Troubleshooting

**Sintoma:** Datasource mostra erro "Unknown datasource type: simpod-json-datasource"

**Causa:** Plugin `simpod-json-datasource` não foi instalado no container Grafana

**Solução:** Verifique se `GF_INSTALL_PLUGINS` no `docker-compose.full-stack.yml` inclui `simpod-json-datasource`. Reinicie o container:

```bash
docker compose -f docker-compose.full-stack.yml restart grafana
docker compose -f docker-compose.full-stack.yml logs grafana | grep -i plugin
```

Você deve ver: `installed simpod-json-datasource successfully`

---

**Sintoma:** Painéis do JSON API datasource aparecem vazios (sem dados)

**Causa:** `OPERATOR_API_KEY` ausente ou a chave não possui role OPERATOR

**Solução:** 

1. Verifique se a variável está definida:
   ```bash
   docker compose -f docker-compose.full-stack.yml exec grafana env | grep OPERATOR_API_KEY
   ```

2. Se ausente, adicione ao `.env` e reinicie o Grafana:
   ```bash
   echo "OPERATOR_API_KEY=sua_chave_aqui" >> .env
   docker compose -f docker-compose.full-stack.yml restart grafana
   ```

3. Se presente, verifique o role da chave:
   - No dashboard OpenWA, vá em **API Keys**
   - Localize a chave usada
   - Verifique se o campo **Role** mostra **OPERATOR**
   - Se não, crie uma nova chave com role OPERATOR e atualize o `.env`

---

**Sintoma:** Painel Prometheus mostra "No Data"

**Causa:** Prometheus não está scrapando o endpoint `/metrics` do OpenWA

**Solução:** 

1. Verifique se Prometheus está rodando:
   ```bash
   docker compose -f docker-compose.full-stack.yml ps prometheus
   ```

2. Acesse Prometheus em http://localhost:9090 e verifique targets:
   - Navegue até **Status → Targets**
   - Procure o job `openwa`
   - Status deve ser **UP**

3. Se status for **DOWN**, verifique a configuração de scrape em `config/prometheus/prometheus.yml`:
   ```yaml
   scrape_configs:
     - job_name: 'openwa'
       static_configs:
         - targets:
             - openwa:9090  # Porta correta do endpoint /metrics
   ```

4. Reinicie Prometheus após corrigir:
   ```bash
   docker compose -f docker-compose.full-stack.yml restart prometheus
   ```

---

## Referências

- [Architecture](ARCHITECTURE.md)
- [Usage Guides](GUIDES.md)
- [Workflows](WORKFLOWS.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Original Setup Docs](archive/)
