# 🚀 Guia de Deploy - Stack Completo OpenWA + n8n + LLM

## 📋 Pré-requisitos

- Docker 24+ e Docker Compose 2.20+
- VPS/servidor com:
  - 4 GB RAM mínimo (8 GB recomendado)
  - 2 vCPU mínimo
  - 50 GB SSD
  - Ubuntu 22.04 LTS ou Debian 12
- Domínio próprio (para SSL automático via Caddy)
- Contas criadas:
  - Groq (grátis): https://console.groq.com/keys
  - Twilio (opcional, para telefonia): https://www.twilio.com/try-twilio

---

## 🛠️ Passo 1: Preparar Servidor

### **1.1 Atualizar sistema:**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git
```

### **1.2 Instalar Docker:**

```bash
# Remover versões antigas
sudo apt remove docker docker-engine docker.io containerd runc

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER
newgrp docker

# Verificar instalação
docker --version
docker compose version
```

---

## 📦 Passo 2: Clonar e Configurar

### **2.1 Baixar arquivos:**

```bash
# Se tiver repositório Git
git clone https://github.com/seu-usuario/openwa-production.git
cd openwa-production

# OU criar estrutura manualmente
mkdir -p openwa-stack && cd openwa-stack
# Copiar os arquivos:
# - docker-compose.full-stack.yml
# - init-db.sql
# - Caddyfile
# - .env.example
```

### **2.2 Configurar variáveis de ambiente:**

```bash
# Copiar exemplo
cp .env.example .env

# Editar com valores reais
nano .env
```

**Valores obrigatórios:**

```bash
# Gerar senha PostgreSQL segura
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Gerar senha n8n segura
N8N_PASSWORD=$(openssl rand -base64 16)

# Gerar chave de criptografia n8n (32 caracteres)
N8N_ENCRYPTION_KEY=$(openssl rand -hex 16)

# Suas chaves API
GROQ_API_KEY=gsk_...  # De console.groq.com
LAWAPP_API_KEY=...     # Do seu Lawapp

# Domínios (configure DNS primeiro!)
OPENWA_DOMAIN=openwa.seudominio.com
N8N_DOMAIN=n8n.seudominio.com
```

### **2.3 Configurar DNS (OBRIGATÓRIO para SSL):**

Crie registros A no seu provedor de domínio:

```
openwa.seudominio.com    →  IP_DO_SEU_SERVIDOR
n8n.seudominio.com       →  IP_DO_SEU_SERVIDOR
webhooks.seudominio.com  →  IP_DO_SEU_SERVIDOR
```

Aguarde propagação (até 24h, mas geralmente < 1h).

---

## 🚀 Passo 3: Subir Stack

### **3.1 Iniciar serviços:**

```bash
# Primeira vez (vai baixar imagens)
docker compose -f docker-compose.full-stack.yml up -d

# Verificar logs
docker compose logs -f

# Verificar status
docker compose ps
```

**Esperado:**

```
NAME          STATUS       PORTS
openwa-api    Up (healthy) 0.0.0.0:2785->2785/tcp
n8n           Up (healthy) 0.0.0.0:5678->5678/tcp
postgres      Up (healthy) 0.0.0.0:5432->5432/tcp
redis         Up (healthy) 0.0.0.0:6379->6379/tcp
caddy         Up           0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

### **3.2 Verificar conectividade:**

```bash
# OpenWA health
curl http://localhost:2785/api/health

# n8n health
curl http://localhost:5678/healthz

# PostgreSQL
docker exec postgres psql -U postgres -c "SELECT version();"

# Redis
docker exec redis redis-cli ping
```

---

## 🔐 Passo 4: Configuração Inicial

### **4.1 Acessar OpenWA Dashboard:**

1. Abra: `https://openwa.seudominio.com` (ou `http://IP_SERVIDOR:2785`)
2. **Não requer login** no browser (apenas API key para API)
3. Vá em **Sessions → Create Session**
4. **Session ID:** `default`
5. **Engine:** `whatsapp-web.js`
6. Clique **Create**
7. Escanear QR code com WhatsApp

### **4.2 Obter API Key do OpenWA:**

```bash
# Método 1: Ver no container
docker exec openwa-api cat /app/data/.api-key

# Método 2: Ver nos logs
docker logs openwa-api 2>&1 | grep "owa_k1_"

# Método 3: Criar nova chave dedicada para n8n
curl -X POST http://localhost:2785/api/auth/api-keys \
  -H "x-api-key: $(docker exec openwa-api cat /app/data/.api-key)" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "n8n Bot Key",
    "role": "OPERATOR"
  }' | jq -r '.key'
```

**Salve essa chave!** Você vai precisar no n8n.

### **4.3 Acessar n8n:**

1. Abra: `https://n8n.seudominio.com` (ou `http://IP_SERVIDOR:5678`)
2. **Login:**
   - User: `admin`
   - Password: (valor de `N8N_PASSWORD` no `.env`)
3. Ir em **Settings → Community Nodes**
4. **Install:** `@rmyndharis/n8n-nodes-openwa`
5. Aguardar instalação (~ 2 minutos)
6. **Restart n8n:**

```bash
docker restart n8n
```

### **4.4 Configurar Credenciais OpenWA no n8n:**

1. No n8n, **Credentials → Add Credential**
2. Buscar **OpenWA API**
3. Configurar:
   - **Server URL:** `http://openwa-api:2785` (⚠️ usar nome do container, não localhost)
   - **API Key:** (colar a chave do passo 4.2)
4. **Test** → Deve retornar sucesso
5. **Save**

---

## 🤖 Passo 5: Importar Workflow de Atendimento

### **5.1 Baixar workflow pronto:**

Copie o JSON do **GUIA_ATENDIMENTO_WHATSAPP_LLM.md** (seção 2.1).

### **5.2 Importar no n8n:**

1. No n8n, clicar **Workflows → New**
2. Menu **⋮** → **Import from File**
3. Colar o JSON
4. **Ou** usar **Import from URL:**

```
https://raw.githubusercontent.com/seu-repo/workflows/atendimento-whatsapp.json
```

### **5.3 Configurar variáveis:**

Editar os nodes:

1. **Groq LLM:**
   - Header `Authorization`: `Bearer SEU_GROQ_API_KEY`
2. **Lawapp API:**
   - Header `Authorization`: `Bearer SEU_LAWAPP_API_KEY`
   - URL: `https://api.lawapp.com/v1/clients`

### **5.4 Ativar workflow:**

1. Clicar em **Inactive** → **Active**
2. Verificar que o **OpenWA Trigger** criou o webhook automaticamente

---

## 🧪 Passo 6: Testar Sistema

### **6.1 Teste básico (WhatsApp):**

1. Envie mensagem para seu número WhatsApp conectado:
   ```
   Olá, preciso de ajuda
   ```
2. Aguarde resposta do bot (5-10s)
3. Verificar logs:
   ```bash
   docker logs -f n8n --tail 100
   ```

### **6.2 Teste de áudio:**

1. Envie áudio de voz para o WhatsApp
2. Bot deve transcrever e responder
3. Verificar logs Groq:
   ```bash
   docker logs n8n | grep "groq"
   ```

### **6.3 Teste de criação de cliente:**

1. Conversa completa simulando intake:
   ```
   Usuário: Olá
   Bot: Olá! Sou a Clara...
   
   Usuário: Quero abrir um processo trabalhista
   Bot: Entendi. Qual seu nome completo?
   
   Usuário: João Silva
   Bot: Prazer João! Qual seu CPF?
   
   Usuário: 123.456.789-00
   Bot: E seu telefone?
   
   Usuário: (11) 99999-9999
   Bot: Por fim, seu e-mail?
   
   Usuário: joao@email.com
   Bot: ✅ Cadastro realizado! Protocolo: PRO-2026-XXXX
   ```

2. Verificar no Lawapp se cliente foi criado

---

## 📊 Passo 7: Monitoramento

### **7.1 Acessar Grafana (opcional):**

1. Abrir: `http://IP_SERVIDOR:3000`
2. Login:
   - User: `admin`
   - Password: (valor de `GRAFANA_PASSWORD` no `.env`)
3. **Dashboards → Import**
4. Usar ID: `1860` (Node Exporter Full)

### **7.2 Verificar métricas Redis:**

```bash
docker exec redis redis-cli INFO stats
```

### **7.3 Verificar uso PostgreSQL:**

```bash
docker exec postgres psql -U postgres -d openwa -c "
  SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"
```

---

## 🔧 Troubleshooting

### **Problema: n8n não conecta ao OpenWA**

```bash
# Verificar rede
docker network inspect openwa-stack_openwa-network

# Ping de um container para outro
docker exec n8n ping -c 3 openwa-api

# Verificar DNS interno
docker exec n8n nslookup openwa-api
```

**Solução:** Use `http://openwa-api:2785` (nome do container) em vez de `localhost`.

---

### **Problema: SSL não funciona (Caddy)**

```bash
# Verificar logs Caddy
docker logs caddy

# Testar DNS
dig openwa.seudominio.com +short

# Deve retornar o IP do servidor
```

**Soluções:**
1. Aguardar propagação DNS (até 24h)
2. Verificar portas 80/443 abertas no firewall:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```
3. Usar modo HTTP temporário:
   ```bash
   # Editar Caddyfile, remover domínios e usar:
   :80 {
       reverse_proxy openwa-api:2785
   }
   ```

---

### **Problema: WhatsApp desconecta**

```bash
# Ver logs detalhados
docker logs openwa-api --tail 500 | grep -i "disconnect\|error"

# Reiniciar sessão
curl -X POST http://localhost:2785/api/sessions/default/restart \
  -H "x-api-key: SUA_CHAVE"
```

**Causas comuns:**
- Muitas mensagens por minuto (rate limit WhatsApp)
- Proxy/VPN instável
- Chromium crashou (verificar memória)

---

## 🔒 Segurança em Produção

### **1. Firewall:**

```bash
# Instalar ufw
sudo apt install ufw

# Regras básicas
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Ativar
sudo ufw enable
```

### **2. Fail2ban (proteção contra brute-force):**

```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### **3. Backup automático:**

O stack já inclui `pg-backup` que faz backup diário.

**Verificar backups:**

```bash
docker exec pg-backup ls -lh /backups/
```

**Restaurar backup:**

```bash
# Copiar backup para host
docker cp pg-backup:/backups/openwa-YYYY-MM-DD.sql.gz ./

# Restaurar
gunzip openwa-YYYY-MM-DD.sql.gz
docker exec -i postgres psql -U postgres openwa < openwa-YYYY-MM-DD.sql
```

---

## 📈 Escalando para Alta Demanda

### **Cenário: > 500 conversas/dia**

```yaml
# docker-compose.scale.yml
services:
  n8n-worker:
    deploy:
      replicas: 5  # Aumentar workers

  openwa-api:
    deploy:
      replicas: 3  # Múltiplas instâncias (requer load balancer)
```

**Executar:**

```bash
docker compose -f docker-compose.full-stack.yml \
               -f docker-compose.scale.yml \
               up -d --scale n8n-worker=5
```

---

## 💰 Custos Mensais Estimados

| Item | Especificação | Custo |
|------|--------------|-------|
| **VPS** | 4GB RAM, 2 vCPU, 50GB SSD | $12-20 |
| **Domínio** | .com.br ou .com | $10-15/ano |
| **Groq API** | 30k conversas/mês | **Grátis** |
| **WhatsApp** | OpenWA (não oficial) | **Grátis** |
| **Twilio** (opcional) | 1000 ligações 3min | $25 |
| **TOTAL** | Sem telefonia | **~$14/mês** |
| **TOTAL** | Com telefonia | **~$39/mês** |

---

## 🎯 Checklist de Go-Live

- [ ] DNS configurado e propagado
- [ ] SSL funcionando (Caddy)
- [ ] WhatsApp conectado e estável (> 24h)
- [ ] Workflow n8n ativado e testado
- [ ] 10 conversas de teste realizadas
- [ ] Integração Lawapp validada
- [ ] Backups automáticos configurados
- [ ] Monitoramento (Grafana) funcionando
- [ ] Firewall ativado
- [ ] Documentação interna criada
- [ ] Treinamento da equipe realizado

---

## 📞 Suporte e Comunidade

- **OpenWA Issues:** https://github.com/rmyndharis/OpenWA/issues
- **n8n Community:** https://community.n8n.io
- **Docker Forums:** https://forums.docker.com

---

**Data:** 2026-08-22  
**Versão:** 1.0  
**Mantido por:** Equipe Lawapp
