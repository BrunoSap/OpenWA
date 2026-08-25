# 🌍 Arquitetura Global - Sistema de Atendimento Multi-Canal e Multi-Região

## 📋 Visão Geral

Sistema de atendimento automatizado **enterprise-grade** com:
- ✅ WhatsApp (texto + áudio) via OpenWA
- ✅ Telefonia (voz) via Twilio/Telnyx multi-região
- ✅ Multi-idioma (PT, EN, ES) com detecção automática
- ✅ Multi-região (BR, US, MX) com roteamento inteligente
- ✅ High Availability (99.9% uptime)
- ✅ Auto-scaling (1-10k conversas/dia)
- ✅ Compliance total (LGPD/GDPR/CCPA)

---

## 🏗️ Diagrama de Arquitetura Completa

```
┌──────────────────────────────────────────────────────────────────┐
│                      CAMADA DE ENTRADA                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ WhatsApp BR │  │ WhatsApp US │  │ WhatsApp MX │              │
│  │ +5511XXXX   │  │ +1555XXXX   │  │ +5255XXXX   │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                       │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐              │
│  │ Twilio BR   │  │ Twilio US   │  │ Twilio MX   │              │
│  │ Voice       │  │ Voice       │  │ Voice       │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼─────────────────┼─────────────────┼────────────────────┘
          │                 │                 │
┌─────────▼─────────────────▼─────────────────▼────────────────────┐
│                  CAMADA DE ROTEAMENTO                             │
│              ┌────────────────────────────┐                       │
│              │  Cloudflare Load Balancer │                       │
│              │  + DDoS Protection         │                       │
│              │  + Geo-routing             │                       │
│              └─────────────┬──────────────┘                       │
└────────────────────────────┼───────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
┌─────────▼────────┐ ┌───────▼────────┐ ┌──────▼──────────┐
│  REGIÃO BR       │ │  REGIÃO US     │ │  REGIÃO MX      │
│  São Paulo       │ │  N. Virginia   │ │  Mexico City    │
│                  │ │                │ │                 │
│ ┌──────────────┐ │ │ ┌────────────┐ │ │ ┌─────────────┐│
│ │ HAProxy      │ │ │ │ HAProxy    │ │ │ │ HAProxy     ││
│ │ (regional LB)│ │ │ │(regional LB│ │ │ │(regional LB)││
│ └──────┬───────┘ │ │ └──────┬─────┘ │ │ └──────┬──────┘│
│        │         │ │        │       │ │        │       │
│ ┌──────▼───────┐ │ │ ┌──────▼─────┐ │ │ ┌──────▼──────┐│
│ │ OpenWA x3    │ │ │ │ OpenWA x3  │ │ │ │ OpenWA x3   ││
│ │ (WhatsApp)   │ │ │ │(WhatsApp)  │ │ │ │(WhatsApp)   ││
│ └──────┬───────┘ │ │ └──────┬─────┘ │ │ └──────┬──────┘│
│        │         │ │        │       │ │        │       │
│ ┌──────▼───────┐ │ │ ┌──────▼─────┐ │ │ ┌──────▼──────┐│
│ │ n8n x5       │ │ │ │ n8n x5     │ │ │ │ n8n x5      ││
│ │ (workers)    │ │ │ │(workers)   │ │ │ │(workers)    ││
│ └──────┬───────┘ │ │ └──────┬─────┘ │ │ └──────┬──────┘│
└────────┼─────────┘ └────────┼───────┘ └────────┼────────┘
         │                    │                  │
         └────────────────────┼──────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│                     CAMADA DE DADOS                               │
│  ┌────────────────────────────────────────────────────────┐      │
│  │         AWS Aurora PostgreSQL (Multi-Region)            │      │
│  │  Primary (BR) → Replica (US) → Replica (MX)            │      │
│  │  Latency: < 100ms cross-region                          │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                    │
│  ┌────────────────────────────────────────────────────────┐      │
│  │         AWS ElastiCache Redis (Cluster Mode)           │      │
│  │  3 shards × 2 replicas = 6 nodes total                 │      │
│  │  Conversation cache + Queue + Session state            │      │
│  └────────────────────────────────────────────────────────┘      │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│                      CAMADA DE IA                                 │
│  ┌──────────────────────────────────────────────────────┐        │
│  │              LLM Router (Smart Failover)              │        │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │        │
│  │  │ Groq     │→ │ OpenAI   │→ │ Anthropic Claude │   │        │
│  │  │Llama 3.3 │  │GPT-4o-mini│  │ Haiku (fallback) │   │        │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                    │
│  ┌──────────────────────────────────────────────────────┐        │
│  │              STT Router (Speech-to-Text)              │        │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │        │
│  │  │ Groq     │→ │ Deepgram │→ │ OpenAI Whisper   │   │        │
│  │  │ Whisper  │  │ Nova-2   │  │ (fallback)       │   │        │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │        │
│  └──────────────────────────────────────────────────────┘        │
└───────────────────────────────────────────────────────────────────┘
```

---

## 🌐 Roteamento Geográfico Inteligente

### **Lógica de Roteamento:**

```javascript
// Cloudflare Worker: Geo-routing
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
});

async function handleRequest(request) {
  const country = request.cf.country;  // BR, US, MX
  const phone = extractPhone(request);
  
  // Detectar região pelo código telefônico
  const region = detectRegion(phone, country);
  
  // Mapear para datacenter mais próximo
  const datacenter = {
    'BR': 'https://br.lawapp.com',
    'US': 'https://us.lawapp.com',
    'MX': 'https://mx.lawapp.com'
  }[region] || 'https://br.lawapp.com';
  
  // Proxy com latency tracking
  const start = Date.now();
  const response = await fetch(`${datacenter}${request.url}`, {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
  
  const latency = Date.now() - start;
  response.headers.set('X-Region', region);
  response.headers.set('X-Latency', latency);
  
  return response;
}

function detectRegion(phone, country) {
  // Priorizar código de telefone
  if (phone.startsWith('+55')) return 'BR';
  if (phone.startsWith('+1')) return 'US';
  if (phone.startsWith('+52')) return 'MX';
  
  // Fallback: IP geolocation
  return countryToRegion(country);
}
```

---

## 🗣️ Sistema Multi-Idioma Inteligente

### **Detecção Automática de Idioma:**

```javascript
// n8n: Language detection workflow
const detectLanguage = async (text, audioMetadata) => {
  // Prioridade 1: Metadata de áudio (Whisper detecta idioma)
  if (audioMetadata?.language) {
    return audioMetadata.language;
  }
  
  // Prioridade 2: Heurísticas rápidas (sem API)
  const patterns = {
    pt: /\b(olá|obrigado|sim|não|por favor|desculpe)\b/i,
    en: /\b(hello|thanks|yes|no|please|sorry)\b/i,
    es: /\b(hola|gracias|sí|no|por favor|perdón)\b/i
  };
  
  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return lang;
    }
  }
  
  // Prioridade 3: API de detecção (Groq suporta 50+ idiomas)
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'Detect language. Reply ONLY with ISO 639-1 code (pt/en/es).'
      },
      {
        role: 'user',
        content: text
      }
    ],
    max_tokens: 5
  });
  
  return response.choices[0].message.content.toLowerCase();
};

// Cache detecção por usuário
await redis.setex(`user:${chatId}:language`, 86400, detectedLang);
```

### **Prompts Multi-Idioma:**

```javascript
// system-prompts.js
const PROMPTS = {
  pt: {
    greeting: "Olá! Sou a Clara 👋, assistente virtual do escritório Lawapp.",
    collect_name: "Qual seu nome completo?",
    collect_cpf: "Qual seu CPF?",
    collect_phone: "Qual melhor telefone de contato?",
    collect_email: "E seu e-mail?",
    ask_issue: "Me conte brevemente sua situação jurídica?",
    confirm: "✅ Cadastro realizado! Protocolo: {protocol}",
    escalate: "Vou transferir para um advogado agora."
  },
  
  en: {
    greeting: "Hello! I'm Clara 👋, virtual assistant for Lawapp Law Firm.",
    collect_name: "What's your full name?",
    collect_cpf: "What's your ID number?",
    collect_phone: "What's your best contact phone?",
    collect_email: "And your email?",
    ask_issue: "Please briefly describe your legal situation?",
    confirm: "✅ Registration completed! Protocol: {protocol}",
    escalate: "I'll transfer you to a lawyer now."
  },
  
  es: {
    greeting: "¡Hola! Soy Clara 👋, asistente virtual del despacho Lawapp.",
    collect_name: "¿Cuál es tu nombre completo?",
    collect_cpf: "¿Cuál es tu documento de identidad?",
    collect_phone: "¿Cuál es tu mejor teléfono de contacto?",
    collect_email: "¿Y tu correo electrónico?",
    ask_issue: "¿Puedes describir brevemente tu situación legal?",
    confirm: "✅ ¡Registro completado! Protocolo: {protocol}",
    escalate: "Te transferiré con un abogado ahora."
  }
};

// Usar no workflow
const userLang = await redis.get(`user:${chatId}:language`) || 'pt';
const prompt = PROMPTS[userLang];

await sendMessage(chatId, prompt.greeting);
```

---

## 📞 Integração Telefonia Multi-Região

### **Números Locais por País:**

```yaml
# twilio-numbers.yml
regions:
  BR:
    voice_number: +55 11 2042-XXXX
    sms_number: +55 11 2042-YYYY
    cost_per_min: $0.0085
    cost_per_sms: $0.012
    provider: Twilio
  
  US:
    voice_number: +1 555 123-XXXX
    sms_number: +1 555 123-YYYY
    cost_per_min: $0.0085
    cost_per_sms: $0.0075
    provider: Twilio
  
  MX:
    voice_number: +52 55 1234-XXXX
    sms_number: +52 55 1234-YYYY
    cost_per_min: $0.0070
    cost_per_sms: $0.010
    provider: Telnyx  # Mais barato no MX
```

### **Workflow Telefonia Unificado:**

```javascript
// n8n: Unified voice workflow
app.post('/webhook/voice-incoming', async (req, res) => {
  const { From, To, Country } = req.body;
  
  // Detectar região
  const region = detectRegion(From, Country);
  const language = REGION_TO_LANGUAGE[region];
  
  // TwiML dinâmico por idioma
  const twiml = `
    <Response>
      <Say voice="${getVoice(language)}" language="${language}">
        ${PROMPTS[language].greeting}
      </Say>
      
      <Gather 
        input="speech" 
        language="${language}" 
        speechTimeout="auto"
        action="https://${region}.lawapp.com/webhook/voice-response">
        
        <Say voice="${getVoice(language)}" language="${language}">
          ${PROMPTS[language].ask_issue}
        </Say>
      </Gather>
    </Response>
  `;
  
  res.type('text/xml').send(twiml);
});

// Mapear vozes por idioma
const getVoice = (lang) => {
  return {
    pt: 'Polly.Camila',      // Brasileiro feminino
    en: 'Polly.Joanna',       // US feminino
    es: 'Polly.Lupe'          // Mexicano feminino
  }[lang];
};
```

---

## 🔄 Sistema Híbrido WhatsApp + Telefone

### **Fluxo: WhatsApp → Telefone (Escalação)**

```javascript
// Cliente inicia no WhatsApp mas precisa falar urgente
Bot (WhatsApp): "Vi que é urgente. Prefere que liguemos para você? 📞"
User: "Sim"

// Twilio API: Iniciar ligação automática
await twilio.calls.create({
  to: userPhone,
  from: TWILIO_NUMBERS[region],
  url: `https://${region}.lawapp.com/webhook/outbound-call?context=${chatId}`
});

// WhatsApp: Confirmação
Bot: "Ligando para você em 30 segundos... ☎️"

// Call workflow recebe contexto da conversa WhatsApp
app.post('/webhook/outbound-call', async (req, res) => {
  const { context } = req.query;
  
  // Carregar histórico WhatsApp
  const history = await redis.get(`conversation:${context}:history`);
  
  // LLM com contexto completo
  const twiml = `
    <Response>
      <Say voice="Polly.Camila">
        Olá! Aqui é a Clara. Vi que você já me contou sobre ${history.summary}.
        Vou te conectar com um advogado agora.
      </Say>
      <Dial>
        <Number>${LAWYER_PHONE}</Number>
      </Dial>
    </Response>
  `;
  
  res.type('text/xml').send(twiml);
});
```

### **Fluxo: Telefone → WhatsApp (Documentos)**

```javascript
// Cliente ligou mas precisa enviar documentos
IVR: "Para enviar documentos, digite 3"

// Twilio SMS com link WhatsApp
await twilio.messages.create({
  to: userPhone,
  from: TWILIO_SMS_NUMBERS[region],
  body: `Olá! Envie seus documentos pelo WhatsApp: https://wa.me/${WHATSAPP_NUMBERS[region]}?text=Protocolo:${protocol}`
});

// WhatsApp workflow detecta protocolo
IF {{$json.body}} contains "Protocolo:"
  THEN → [Carregar contexto da ligação]
       → [Aceitar anexos]
       → [Confirmar recebimento]
```

---

## 🛡️ High Availability e Failover

### **Health Checks Multi-Layer:**

```yaml
# prometheus-health-checks.yml
scrape_configs:
  # OpenWA sessions
  - job_name: 'openwa'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: 
        - 'openwa-br-1:2785'
        - 'openwa-br-2:2785'
        - 'openwa-br-3:2785'
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
  
  # n8n workers
  - job_name: 'n8n'
    metrics_path: '/healthz'
    static_configs:
      - targets:
        - 'n8n-br-1:5678'
        - 'n8n-br-2:5678'
        - 'n8n-br-3:5678'
        - 'n8n-br-4:5678'
        - 'n8n-br-5:5678'
  
  # PostgreSQL
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-primary:9187']
      - targets: ['postgres-replica-us:9187']
      - targets: ['postgres-replica-mx:9187']
  
  # Redis
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-cluster:9121']
```

### **Auto-Failover Logic:**

```javascript
// HAProxy: Active health checking
global
    log stdout format raw local0
    maxconn 4096

defaults
    mode http
    timeout connect 5s
    timeout client 30s
    timeout server 30s
    option httpchk GET /api/health
    http-check expect status 200

# OpenWA backend
backend openwa_backend
    balance roundrobin
    option httpchk GET /api/sessions/default/status
    http-check expect string "CONNECTED"
    
    server openwa1 openwa-1:2785 check inter 10s fall 3 rise 2
    server openwa2 openwa-2:2785 check inter 10s fall 3 rise 2 backup
    server openwa3 openwa-3:2785 check inter 10s fall 3 rise 2 backup

# n8n backend
backend n8n_backend
    balance leastconn  # Distribuir por menor carga
    option httpchk GET /healthz
    
    server n8n1 n8n-1:5678 check inter 5s
    server n8n2 n8n-2:5678 check inter 5s
    server n8n3 n8n-3:5678 check inter 5s
    server n8n4 n8n-4:5678 check inter 5s
    server n8n5 n8n-5:5678 check inter 5s
```

---

## 💾 Estratégia de Dados Multi-Região

### **PostgreSQL Aurora Global Database:**

```sql
-- Primary (BR): Write operations
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region VARCHAR(2) NOT NULL,  -- BR, US, MX
  name VARCHAR(255),
  document VARCHAR(50),  -- CPF, SSN, CURP
  phone VARCHAR(20),
  email VARCHAR(255),
  language VARCHAR(2),  -- pt, en, es
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para queries regionais
CREATE INDEX idx_clients_region ON clients(region);
CREATE INDEX idx_clients_phone ON clients(phone);

-- Replica (US, MX): Read operations
-- Latência: < 100ms para replicação cross-region
```

### **Redis Cluster para Sessões:**

```yaml
# redis-cluster.conf
cluster-enabled yes
cluster-node-timeout 5000
cluster-replica-validity-factor 0
cluster-migration-barrier 1

# Sharding strategy
hash-slot-distribution:
  shard-1: 0-5460      # Conversas BR
  shard-2: 5461-10922  # Conversas US
  shard-3: 10923-16383 # Conversas MX

# Cada shard tem 1 replica
shard-1-replica: redis-replica-1
shard-2-replica: redis-replica-2
shard-3-replica: redis-replica-3
```

---

## 📊 Monitoramento e Observabilidade

### **Dashboard Global:**

```javascript
// Grafana: Global overview dashboard
{
  "panels": [
    {
      "title": "Conversas por Região (24h)",
      "type": "pie",
      "targets": [
        {
          "expr": "sum by (region) (conversations_total{period='24h'})"
        }
      ]
    },
    {
      "title": "Latência Média por Região",
      "type": "graph",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(response_latency_seconds_bucket[5m])) by (region)"
        }
      ]
    },
    {
      "title": "Taxa de Conversão por Idioma",
      "type": "table",
      "targets": [
        {
          "expr": "(clients_created_total / conversations_total) * 100 by (language)"
        }
      ]
    },
    {
      "title": "Custo por Região (mensal)",
      "type": "stat",
      "targets": [
        {
          "expr": "sum(llm_cost_usd + voice_cost_usd + whatsapp_cost_usd) by (region)"
        }
      ]
    },
    {
      "title": "Uptime por Componente",
      "type": "status",
      "targets": [
        {
          "expr": "up{job=~'openwa|n8n|postgres|redis'}"
        }
      ]
    }
  ]
}
```

---

## 💰 Análise de Custos Global

### **Custo por Região (1000 conversas/mês):**

| Item | BR | US | MX | Total |
|------|----|----|----|----|
| **VPS** (3x 8GB RAM) | $80 | $80 | $80 | $240 |
| **WhatsApp** (OpenWA) | $0 | $0 | $0 | $0 |
| **Telefonia** (100 ligações 3min) | $25 | $25 | $21 | $71 |
| **LLM** (70% Groq, 30% OpenAI) | $10 | $10 | $10 | $30 |
| **Aurora PostgreSQL** | - | - | - | $150 |
| **ElastiCache Redis** | - | - | - | $120 |
| **Cloudflare** | - | - | - | $20 |
| **Monitoring** (Datadog) | - | - | - | $50 |
| **Backup** (S3 multi-region) | - | - | - | $30 |
| **TOTAL/mês** | - | - | - | **$711** |

**Custo por conversa:** $0.24  
**Custo por cliente adquirido:** $7.11 (assumindo 10% conversão)

---

## 🚀 Deploy Multi-Região

### **Terraform Infrastructure:**

```hcl
# main.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Regions
provider "aws" {
  alias  = "br"
  region = "sa-east-1"  # São Paulo
}

provider "aws" {
  alias  = "us"
  region = "us-east-1"  # N. Virginia
}

provider "aws" {
  alias  = "mx"
  region = "us-west-2"  # Oregon (mais próximo do México)
}

# Aurora Global Database
resource "aws_rds_global_cluster" "lawapp" {
  global_cluster_identifier = "lawapp-global"
  engine                    = "aurora-postgresql"
  engine_version            = "16.1"
  database_name             = "lawapp"
}

# Primary cluster (BR)
resource "aws_rds_cluster" "primary" {
  provider                  = aws.br
  cluster_identifier        = "lawapp-primary-br"
  engine                    = "aurora-postgresql"
  global_cluster_identifier = aws_rds_global_cluster.lawapp.id
  master_username           = "lawapp"
  master_password           = var.db_password
  
  db_subnet_group_name   = aws_db_subnet_group.br.name
  vpc_security_group_ids = [aws_security_group.db_br.id]
}

# Secondary cluster (US)
resource "aws_rds_cluster" "secondary_us" {
  provider                  = aws.us
  cluster_identifier        = "lawapp-replica-us"
  engine                    = "aurora-postgresql"
  global_cluster_identifier = aws_rds_global_cluster.lawapp.id
  
  depends_on = [aws_rds_cluster.primary]
}

# Secondary cluster (MX)
resource "aws_rds_cluster" "secondary_mx" {
  provider                  = aws.mx
  cluster_identifier        = "lawapp-replica-mx"
  engine                    = "aurora-postgresql"
  global_cluster_identifier = aws_rds_global_cluster.lawapp.id
  
  depends_on = [aws_rds_cluster.primary]
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "lawapp-redis"
  description                = "Lawapp Redis cluster"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.r7g.large"
  num_node_groups            = 3  # 3 shards
  replicas_per_node_group    = 1  # 1 replica por shard
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

# ECS Cluster (n8n + OpenWA)
resource "aws_ecs_cluster" "lawapp_br" {
  provider = aws.br
  name     = "lawapp-cluster-br"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Auto Scaling para n8n workers
resource "aws_appautoscaling_target" "n8n" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.lawapp_br.name}/${aws_ecs_service.n8n.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "n8n_cpu" {
  name               = "n8n-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.n8n.resource_id
  scalable_dimension = aws_appautoscaling_target.n8n.scalable_dimension
  service_namespace  = aws_appautoscaling_target.n8n.service_namespace
  
  target_tracking_scaling_policy_configuration {
    target_value = 70.0
    
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
```

---

## 📋 Checklist de Deploy Global

### **Pré-requisitos:**
- [ ] Contas AWS em 3 regiões (BR, US, MX)
- [ ] Domínios configurados (br.lawapp.com, us.lawapp.com, mx.lawapp.com)
- [ ] Cloudflare account com Load Balancing habilitado
- [ ] Twilio accounts com números em 3 países
- [ ] WhatsApp Business accounts (3 números)
- [ ] Groq + OpenAI + Anthropic API keys

### **Fase 1: Infraestrutura (Semana 1-2)**
- [ ] Deploy Terraform (Aurora + ElastiCache + ECS)
- [ ] Configurar VPCs e subnets
- [ ] Setup HAProxy em cada região
- [ ] Configurar Cloudflare Load Balancer
- [ ] Testes de conectividade cross-region

### **Fase 2: Aplicação (Semana 3-4)**
- [ ] Deploy OpenWA (3 instâncias por região)
- [ ] Deploy n8n (5 workers por região)
- [ ] Importar workflows multi-idioma
- [ ] Configurar credenciais (API keys)
- [ ] Testes de healthcheck

### **Fase 3: Telefonia (Semana 5)**
- [ ] Comprar números Twilio (BR, US, MX)
- [ ] Configurar webhooks por região
- [ ] Deploy workflows de voz
- [ ] Testes de ligação end-to-end

### **Fase 4: WhatsApp (Semana 6)**
- [ ] Conectar 3 números WhatsApp (1 por região)
- [ ] Configurar roteamento geográfico
- [ ] Testes de mensagens cross-region
- [ ] Validar latência < 2s

### **Fase 5: Monitoramento (Semana 7)**
- [ ] Setup Datadog multi-region
- [ ] Importar dashboards
- [ ] Configurar alertas
- [ ] Testes de failover

### **Fase 6: Go-Live (Semana 8)**
- [ ] Testes de carga (1000 conversas simultâneas)
- [ ] Disaster recovery drill
- [ ] Documentação operacional
- [ ] Treinamento equipe
- [ ] **GO-LIVE** 🚀

---

**Criado em:** 2026-08-22  
**Versão:** 1.0  
**Próxima revisão:** Após deploy piloto em 1 região
