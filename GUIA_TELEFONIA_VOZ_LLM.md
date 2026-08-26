# 📞 Guia: Atendimento de Voz via Telefone com LLM (Alternativa ao WhatsApp Call)

## ⚠️ Contexto Importante

**WhatsApp não suporta ligações via API** (nem oficial, nem não-oficial como OpenWA).

Este guia apresenta a **alternativa profissional** para atendimento de voz automatizado por LLM usando **telefonia SIP tradicional** integrada ao mesmo workflow do WhatsApp.

---

## 🏗️ Arquitetura: Sistema Híbrido (WhatsApp + Telefone)

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTE FINAL                             │
│  📱 WhatsApp Text/Audio  OU  ☎️ Ligação Telefônica          │
└─────────────────────────────────────────────────────────────┘
            │                              │
            │                              │
            ▼                              ▼
   ┌────────────────┐           ┌────────────────────┐
   │  OpenWA API    │           │  Twilio/Plivo      │
   │  (WhatsApp)    │           │  Voice Gateway     │
   └────────────────┘           └────────────────────┘
            │                              │
            └──────────────┬───────────────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │   n8n Workflow   │
                 │  (orquestrador)  │
                 └──────────────────┘
                           │
                  ┌────────┴────────┐
                  │                 │
                  ▼                 ▼
          ┌──────────────┐   ┌──────────────┐
          │  Groq API    │   │  Lawapp API  │
          │  (LLM + STT) │   │  (CRM)       │
          └──────────────┘   └──────────────┘
```

---

## 💰 Comparação de Provedores de Telefonia

### **Análise Custo-Benefício (2026):**

| Provedor | Custo/min (Brasil) | SMS | WebRTC | Streaming STT | Latência | Setup |
|----------|-------------------|-----|--------|---------------|----------|-------|
| **Twilio** | $0.0085 | ✅ | ✅ | ✅ | ~150ms | Fácil |
| **Plivo** | $0.0070 | ✅ | ✅ | ❌ | ~180ms | Fácil |
| **Telnyx** | $0.0040 | ✅ | ✅ | ✅ | ~120ms | Médio |
| **Vonage** | $0.0060 | ✅ | ✅ | ❌ | ~200ms | Difícil |
| **Bandwidth** | $0.0050 | ✅ | ❌ | ❌ | ~160ms | Médio |

**Custo estimado (1000 ligações de 3min/mês):**
- Twilio: ~$25.50/mês
- Plivo: ~$21.00/mês
- Telnyx: ~$12.00/mês ⭐ **MAIS BARATO**

---

## 🚀 Opção 1: Twilio Voice (RECOMENDADO - Mais Fácil)

### **Vantagens:**
- ✅ Documentação excelente
- ✅ SDK para todas as linguagens
- ✅ Streaming WebSocket para Whisper em tempo real
- ✅ Suporte 24/7

### **Desvantagens:**
- ❌ Mais caro
- ❌ Requer cartão de crédito desde o início

---

### **1.1 Setup Twilio**

1. **Criar conta:** https://www.twilio.com/try-twilio
2. **Comprar número brasileiro:** +55 11 XXXX-XXXX (~$1/mês)
3. **Obter credenciais:**
   - Account SID: `ACxxxxxx`
   - Auth Token: `xxxxxx`

---

### **1.2 Workflow n8n com Twilio Voice**

**Fluxo completo:**

```
[Twilio Voice Webhook] → [n8n Webhook Receive]
                               │
                               ├─ [Stream Audio → Groq Whisper]
                               │        │
                               │        ▼
                               ├─ [Transcription → Groq LLM]
                               │        │
                               │        ▼
                               ├─ [Response Text → Twilio TTS]
                               │        │
                               │        ▼
                               └─ [Lawapp: Create Case se intent detectado]
```

---

### **1.3 Código TwiML (Resposta Inicial)**

Crie um endpoint webhook no n8n (`/webhook/twilio-voice-start`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Camila" language="pt-BR">
        Olá! Você ligou para o escritório Lawapp Advocacia. Sou a Clara, assistente virtual. 
        Como posso ajudar hoje?
    </Say>
    
    <Gather 
        input="speech" 
        language="pt-BR" 
        speechTimeout="auto"
        action="https://seu-n8n.com/webhook/twilio-voice-response"
        method="POST">
        
        <Say voice="Polly.Camila" language="pt-BR">
            Por favor, descreva brevemente sua situação jurídica.
        </Say>
    </Gather>
    
    <Say voice="Polly.Camila" language="pt-BR">
        Desculpe, não entendi. Por favor, ligue novamente.
    </Say>
</Response>
```

---

### **1.4 Workflow n8n (JSON Completo)**

```json
{
  "name": "Twilio Voice AI Agent",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "twilio-voice-start",
        "responseMode": "responseNode",
        "options": {}
      },
      "name": "Webhook: Incoming Call",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300]
    },
    {
      "parameters": {
        "respondWith": "text",
        "responseBody": "={{$json.twiml}}",
        "options": {
          "responseHeaders": {
            "entries": [
              {
                "name": "Content-Type",
                "value": "text/xml"
              }
            ]
          }
        }
      },
      "name": "Response: TwiML",
      "type": "n8n-nodes-base.respondToWebhook",
      "position": [450, 300]
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "twilio-voice-response",
        "responseMode": "responseNode"
      },
      "name": "Webhook: User Speech",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 500]
    },
    {
      "parameters": {
        "jsCode": "// Extrair transcrição do Twilio\nconst speechResult = $input.item.json.SpeechResult;\nconst from = $input.item.json.From;\nconst callSid = $input.item.json.CallSid;\n\nreturn {\n  json: {\n    transcription: speechResult,\n    phoneNumber: from,\n    callSid: callSid\n  }\n};"
      },
      "name": "Parse Twilio Data",
      "type": "n8n-nodes-base.code",
      "position": [450, 500]
    },
    {
      "parameters": {
        "url": "https://api.groq.com/openai/v1/chat/completions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer gsk_SUA_CHAVE_GROQ"
            }
          ]
        },
        "sendBody": true,
        "contentType": "json",
        "specifyBody": "json",
        "jsonBody": "={\n  \"model\": \"llama-3.3-70b-versatile\",\n  \"messages\": [\n    {\n      \"role\": \"system\",\n      \"content\": \"Você é a Clara, assistente de voz do escritório Lawapp. Responda de forma EXTREMAMENTE CONCISA (máximo 2 frases). Tom profissional mas empático. Se identificar uma demanda jurídica clara, colete: nome, telefone, e-mail. Quando tiver dados completos, retorne JSON: {action: 'create_client', data: {...}}\"\n    },\n    {\n      \"role\": \"user\",\n      \"content\": \"{{$json.transcription}}\"\n    }\n  ],\n  \"temperature\": 0.7,\n  \"max_tokens\": 150\n}",
        "options": {}
      },
      "name": "Groq LLM",
      "type": "n8n-nodes-base.httpRequest",
      "position": [650, 500]
    },
    {
      "parameters": {
        "jsCode": "const llmResponse = $input.item.json.choices[0].message.content;\n\n// Gerar TwiML com resposta\nconst twiml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Response>\n    <Say voice=\"Polly.Camila\" language=\"pt-BR\">\n        ${llmResponse}\n    </Say>\n    \n    <Gather \n        input=\"speech\" \n        language=\"pt-BR\" \n        speechTimeout=\"auto\"\n        action=\"https://seu-n8n.com/webhook/twilio-voice-response\"\n        method=\"POST\">\n        <Pause length=\"1\"/>\n    </Gather>\n    \n    <Say voice=\"Polly.Camila\" language=\"pt-BR\">\n        Obrigada por ligar. Um advogado entrará em contato. Até logo!\n    </Say>\n    <Hangup/>\n</Response>`;\n\nreturn {\n  json: {\n    twiml: twiml,\n    llmResponse: llmResponse\n  }\n};"
      },
      "name": "Generate TwiML Response",
      "type": "n8n-nodes-base.code",
      "position": [850, 500]
    },
    {
      "parameters": {
        "respondWith": "text",
        "responseBody": "={{$json.twiml}}",
        "options": {
          "responseHeaders": {
            "entries": [
              {
                "name": "Content-Type",
                "value": "text/xml"
              }
            ]
          }
        }
      },
      "name": "Response: TwiML with LLM",
      "type": "n8n-nodes-base.respondToWebhook",
      "position": [1050, 500]
    },
    {
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{$json.llmResponse}}",
              "operation": "contains",
              "value2": "create_client"
            }
          ]
        }
      },
      "name": "IF Create Client",
      "type": "n8n-nodes-base.if",
      "position": [850, 700]
    },
    {
      "parameters": {
        "url": "https://api.lawapp.com/v1/clients",
        "authentication": "headerAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer SUA_CHAVE_LAWAPP"
            }
          ]
        },
        "sendBody": true,
        "contentType": "json",
        "specifyBody": "json",
        "jsonBody": "={{$json.clientData}}",
        "options": {}
      },
      "name": "Lawapp: Create Client",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1050, 700]
    },
    {
      "parameters": {
        "url": "=https://api.twilio.com/2010-04-01/Accounts/{{$env.TWILIO_ACCOUNT_SID}}/Messages.json",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpBasicAuth",
        "sendBody": true,
        "contentType": "form-urlencoded",
        "bodyParameters": {
          "parameters": [
            {
              "name": "From",
              "value": "={{$env.TWILIO_PHONE_NUMBER}}"
            },
            {
              "name": "To",
              "value": "={{$('Parse Twilio Data').item.json.phoneNumber}}"
            },
            {
              "name": "Body",
              "value": "Olá! Recebemos sua ligação. Seu protocolo é {{$json.protocol}}. Um advogado entrará em contato em até 24h. - Lawapp Advocacia"
            }
          ]
        }
      },
      "name": "Twilio: Send SMS Confirmation",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1250, 700]
    }
  ],
  "connections": {
    "Webhook: Incoming Call": {
      "main": [
        [
          {
            "node": "Response: TwiML",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Webhook: User Speech": {
      "main": [
        [
          {
            "node": "Parse Twilio Data",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Parse Twilio Data": {
      "main": [
        [
          {
            "node": "Groq LLM",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Groq LLM": {
      "main": [
        [
          {
            "node": "Generate TwiML Response",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF Create Client",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Generate TwiML Response": {
      "main": [
        [
          {
            "node": "Response: TwiML with LLM",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF Create Client": {
      "main": [
        [
          {
            "node": "Lawapp: Create Client",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Lawapp: Create Client": {
      "main": [
        [
          {
            "node": "Twilio: Send SMS Confirmation",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

---

### **1.5 Configurar Webhook no Twilio**

1. Acesse: https://console.twilio.com/phone-numbers
2. Clique no seu número brasileiro
3. Em **Voice & Fax**, configure:
   - **A CALL COMES IN:** Webhook
   - **URL:** `https://seu-n8n.com/webhook/twilio-voice-start`
   - **HTTP:** POST
4. **Save**

---

## 🎙️ Opção 2: Streaming Real-Time (Latência Ultra-Baixa)

Para conversas **mais naturais** (< 1s de latência), use **Twilio Media Streams** + **Groq Whisper streaming**:

### **Arquitetura:**

```
[Cliente liga] → [Twilio] → [WebSocket Stream] → [n8n]
                                                      │
                                                      ├─ [Buffer áudio]
                                                      │
                                                      ├─ [Groq Whisper (stream)]
                                                      │       │
                                                      │       ▼
                                                      ├─ [Groq LLM]
                                                      │       │
                                                      │       ▼
                                                      └─ [Twilio TTS Stream]
```

**TwiML para ativar streaming:**

```xml
<Response>
    <Connect>
        <Stream url="wss://seu-n8n.com/twilio-stream">
            <Parameter name="aCustomParameter" value="customValue"/>
        </Stream>
    </Connect>
</Response>
```

**Node.js para processar WebSocket** (rodar em container separado):

```javascript
const WebSocket = require('ws');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  let audioBuffer = Buffer.alloc(0);
  
  ws.on('message', async (message) => {
    const msg = JSON.parse(message);
    
    if (msg.event === 'media') {
      // Acumular áudio
      const chunk = Buffer.from(msg.media.payload, 'base64');
      audioBuffer = Buffer.concat([audioBuffer, chunk]);
      
      // A cada 3 segundos, transcrever
      if (audioBuffer.length >= 48000) { // ~3s de áudio
        const transcription = await groq.audio.transcriptions.create({
          file: audioBuffer,
          model: 'whisper-large-v3',
          language: 'pt'
        });
        
        console.log('User said:', transcription.text);
        
        // Chamar LLM
        const response = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'Você é a Clara...' },
            { role: 'user', content: transcription.text }
          ],
          max_tokens: 100
        });
        
        const llmText = response.choices[0].message.content;
        
        // Enviar para Twilio TTS
        ws.send(JSON.stringify({
          event: 'tts',
          text: llmText
        }));
        
        audioBuffer = Buffer.alloc(0);
      }
    }
  });
});
```

---

## 🚀 Opção 3: Telnyx (Melhor Custo-Benefício)

### **Vantagens:**
- ✅ **Mais barato** ($0.004/min)
- ✅ WebRTC nativo
- ✅ API moderna (REST + GraphQL)
- ✅ Sem taxa de setup

### **Desvantagens:**
- ❌ Documentação inferior ao Twilio
- ❌ Menos exemplos prontos

### **Setup rápido:**

```bash
# 1. Criar conta: https://portal.telnyx.com/sign-up
# 2. Comprar número brasileiro: ~$1/mês
# 3. Criar Call Control Application

curl -X POST https://api.telnyx.com/v2/call_control_applications \
  -H "Authorization: Bearer SEU_TELNYX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "application_name": "Lawapp Voice AI",
    "webhook_event_url": "https://seu-n8n.com/webhook/telnyx-call",
    "webhook_api_version": "2"
  }'
```

**Webhook payload (Telnyx):**

```json
{
  "data": {
    "event_type": "call.initiated",
    "payload": {
      "call_control_id": "call_abc123",
      "from": "+5511999999999",
      "to": "+5511888888888",
      "call_leg_id": "leg_xyz"
    }
  }
}
```

**n8n node para responder:**

```javascript
// Aceitar chamada e coletar fala
const response = {
  command: 'answer_call',
  call_control_id: $json.data.payload.call_control_id
};

// Depois fazer gather
{
  command: 'gather_using_speak',
  call_control_id: $json.data.payload.call_control_id,
  payload: 'Olá, como posso ajudar?',
  language: 'pt-BR',
  voice: 'Polly.Camila'
}
```

---

## 🎯 Comparação: Quando Usar Cada Canal

| Cenário | WhatsApp | Telefone | Ambos |
|---------|----------|----------|-------|
| Cliente jovem (18-35 anos) | ✅ Preferível | ❌ | ✅ |
| Cliente idoso (60+ anos) | ❌ | ✅ Preferível | ✅ |
| Urgência alta | ❌ | ✅ Resposta imediata | ✅ |
| Anexar documentos | ✅ Fácil | ❌ Difícil | ✅ |
| Custo operacional | 💰 Muito baixo | 💰💰 Médio | 💰💰 |
| Escalabilidade | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 🔗 Sistema Unificado (WhatsApp + Telefone)

### **Fluxo Ideal:**

```
Cliente liga (+55 11 XXXX-XXXX)
       │
       └─ [Twilio Voice: Menu IVR]
              │
              ├─ Opção 1: Falar com IA → [LLM Voice]
              │                              │
              │                              ├─ Coleta inicial
              │                              │
              │                              └─ [Envia WhatsApp com link]:
              │                                  "Enviamos as próximas etapas 
              │                                   para seu WhatsApp: wa.me/..."
              │
              ├─ Opção 2: Advogado humano → [Encaminhar]
              │
              └─ Opção 3: Enviar documentos → [SMS com link]:
                                                "Envie docs via WhatsApp: 
                                                 wa.me/5511XXXX"
```

**TwiML do menu:**

```xml
<Response>
    <Gather input="dtmf" numDigits="1" action="/webhook/menu-choice">
        <Say voice="Polly.Camila" language="pt-BR">
            Bem-vindo ao escritório Lawapp. 
            Para atendimento com assistente virtual, digite 1.
            Para falar com um advogado, digite 2.
            Para enviar documentos via WhatsApp, digite 3.
        </Say>
    </Gather>
</Response>
```

---

## 📊 Custos Comparados (Cenário Real)

### **Escritório de advocacia pequeno (50 atendimentos/dia):**

| Canal | Volume | Custo/mês | Conversão |
|-------|--------|-----------|-----------|
| **WhatsApp (OpenWA + Groq)** | 40 conversas/dia | **$3.60** | 25% → 10 clientes |
| **Telefone (Telnyx + Groq)** | 10 ligações/dia (5min) | **$60** | 40% → 4 clientes |
| **TOTAL** | 50 atendimentos/dia | **$63.60/mês** | **14 clientes novos** |

**ROI:**
- Custo por cliente adquirido: ~$4.54
- 1 caso jurídico = ~R$3.000 em honorários
- **ROI: 66.000%** 🚀

---

## 🛠️ Ferramentas Extras

### **1. Deepgram (STT mais rápido que Groq)**

```bash
# Transcription em 200ms (vs 500ms Groq)
curl -X POST https://api.deepgram.com/v1/listen \
  -H "Authorization: Token SUA_CHAVE" \
  -H "Content-Type: audio/wav" \
  --data-binary @audio.wav
```

**Custo:** $0.0043/min (mais barato que OpenAI)

---

### **2. ElevenLabs (TTS Humanizada)**

Para voz **ultra-realista** (indistinguível de humano):

```bash
curl -X POST https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM \
  -H "xi-api-key: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Olá, sou a Clara do escritório Lawapp",
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.75
    }
  }'
```

**Custo:** $0.30/1000 caracteres
**Resultado:** Voz MUITO mais natural que Polly

---

### **3. Retell AI (Solução Completa Pronta)**

Se quiser algo **100% plug-and-play**:

- **Site:** https://www.retellai.com/
- **Preço:** $0.10/min (all-inclusive)
- **Include:** LLM + STT + TTS + Telefonia
- **Setup:** 5 minutos

**Prós:** Zero código, dashboard visual
**Contras:** Vendor lock-in, mais caro a longo prazo

---

## 🎬 Implementação em 3 Dias

### **Dia 1: Setup Básico**
- [ ] Criar conta Twilio
- [ ] Comprar número brasileiro
- [ ] Configurar primeiro webhook
- [ ] Teste: ligar e ouvir mensagem fixa

### **Dia 2: Integração LLM**
- [ ] Workflow n8n funcionando
- [ ] Twilio → Groq Whisper → LLM → TTS
- [ ] Teste: conversa de 3 turnos

### **Dia 3: Refinamento**
- [ ] Prompts otimizados
- [ ] Integração Lawapp
- [ ] Teste com 10 ligações reais
- [ ] Monitoramento de custos

---

## 🆘 Troubleshooting

### **Problema: Latência alta (> 5s)**

```javascript
// Soluções:
1. Use Groq (não OpenAI) → 10x mais rápido
2. Reduza max_tokens para 100-150
3. Use streaming WebSocket (não polling)
4. Cache respostas comuns no Redis
```

### **Problema: Voz robótica**

```xml
<!-- Use vozes neurais da AWS Polly -->
<Say voice="Polly.Camila">...</Say>  <!-- pt-BR feminino -->
<Say voice="Polly.Ricardo">...</Say> <!-- pt-BR masculino -->

<!-- Ou ElevenLabs para voz 100% humana -->
```

### **Problema: Cliente desliga antes de terminar**

```javascript
// Adicione confirmações rápidas:
"Entendi. Vou anotar isso." // A cada 15s
"Estou te ouvindo, continue." // Se silêncio > 5s
```

---

## 📚 Recursos Adicionais

- **Twilio Docs:** https://www.twilio.com/docs/voice
- **Groq Voice Examples:** https://console.groq.com/docs/speech-text
- **n8n Voice Templates:** https://n8n.io/workflows?search=voice
- **Deepgram Node.js SDK:** https://github.com/deepgram/deepgram-js-sdk

---

**Criado em:** 2026-08-22  
**Por:** Claude (Opus 4.8)  
**Versão:** 1.0
