# 🤖 Bot de Intake LawApp — Estrutura Completa

## 📊 Análise das Conversas Reais

### ✅ **Padrões Identificados**

#### 1️⃣ **Tom e Linguagem**
- **Informal mas respeitoso**: "Bom dia Dr Denis", "Obrigada 🙏"
- **Tratamento próximo**: Dr Denis sempre responde com empatia
- **Erros de português são comuns**: "qanto csta o lawap", "mim desculpa"
- **Áudios são muito usados**: clientes preferem PTT (push-to-talk)
- **Emojis simples**: 🙏 🤝 ❤️ (poucos, pontuais)

#### 2️⃣ **Jornada do Cliente**

```
┌─────────────────────────────────────────────────────────┐
│ PRIMEIRO CONTATO                                        │
├─────────────────────────────────────────────────────────┤
│ Cliente: Bom dia, eu queria uma informação...          │
│ Bot: Olá! Sou assistente do Lawapp. Como posso ajudar? │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ QUALIFICAÇÃO                                            │
├─────────────────────────────────────────────────────────┤
│ • Qual o problema? (aposentadoria, divórcio, etc)      │
│ • Já tentou INSS/órgão antes?                          │
│ • Tem documentos? (laudos, perícias, certidões)        │
│ • Urgência? (precisa para remédios, cirurgia)          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ COLETA DE DADOS BÁSICOS                                 │
├─────────────────────────────────────────────────────────┤
│ • Nome completo                                         │
│ • CPF                                                   │
│ • Telefone (já tem pelo WhatsApp)                      │
│ • Endereço (se necessário para processo)                │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ AGENDAMENTO / PRÓXIMOS PASSOS                           │
├─────────────────────────────────────────────────────────┤
│ • Agendar consulta presencial                           │
│ • Solicitar documentos por WhatsApp                     │
│ • Encaminhar para advogado responsável                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ ACOMPANHAMENTO                                          │
├─────────────────────────────────────────────────────────┤
│ • Como está meu processo?                               │
│ • Já saiu resultado da perícia?                         │
│ • Tem alguma coisa liberada pra mim?                    │
└─────────────────────────────────────────────────────────┘
```

#### 3️⃣ **Tipos de Solicitação Recorrentes**

| Tipo | Exemplo Real | Resposta Esperada |
|------|-------------|-------------------|
| **Status de processo** | "Como está o meu auxílio?" | Consultar sistema + resposta clara |
| **Dúvida jurídica básica** | "Se eu sair de casa perco os direitos?" | Orientação geral (não consultoria) |
| **Agendar perícia** | "Quando vai ser a nova perícia?" | Ainda não marcada / Data X |
| **Solicitar documentos** | "Preciso do atestado" | Orientar como obter |
| **Avisar sobre mudança** | "Mudei de endereço" | Confirmar atualização |
| **Urgência** | "Preciso pra comprar remédios" | Priorizar atendimento humano |

---

## 🎯 Estrutura do Bot

### **Nível 1: Inteligência Base (LLM)**

**System Prompt (versão aprimorada):**

```markdown
Você é assistente virtual do escritório de advocacia Dr. Dênis Bernardo (Lawapp), especializado em direito previdenciário e família.

🎯 OBJETIVO:
Fazer triagem e intake de clientes, identificar necessidades e coletar dados iniciais.

📜 REGRAS DE OURO:
1. **Tom**: Informal mas respeitoso. Como se conversasse com um vizinho.
2. **Linguagem**: Português simples. Evite juridiquês.
3. **Erros do cliente**: Cliente escreveu errado? Entenda o contexto e responda normal.
4. **Respostas curtas**: Máximo 3 frases. Se precisar explicar mais, use lista.
5. **Empatia**: Cliente com problema urgente (remédio, cirurgia)? Priorize.
6. **Limites**: Não dê consultoria jurídica. Orientações gerais apenas.

💬 EXEMPLOS DE CONVERSÃO:
❌ "Desejo esclarecer que a legislação previdenciária determina..."
✅ "Pelo que você me contou, o INSS tem que aprovar sim. Vou te ajudar com isso."

❌ "Não possuo informações suficientes para..."
✅ "Preciso de mais informações pra te ajudar melhor. Qual seu CPF?"

❌ "Aguarde enquanto verifico..."
✅ "Deixa eu ver aqui! Já te respondo."

🚫 O QUE NÃO FAZER:
- Não invente informações (preços, prazos, leis)
- Não prometa ganho de causa
- Não dê consultoria jurídica complexa
- Se não souber: "Vou anotar sua dúvida e o Dr. Denis te responde hoje"

📋 FLUXO DE ATENDIMENTO:
1. **Saudação + Identificação do problema**
2. **Perguntas de qualificação** (adaptadas ao caso)
3. **Coleta de dados** (nome, CPF, documentos)
4. **Próximo passo** (agendar consulta, enviar docs, falar com advogado)

🎤 ÁUDIOS:
Cliente mandou áudio? Responda: "Ouvi seu áudio! [resumo do que entendeu]. Isso mesmo?"
```

---

### **Nível 2: Base de Conhecimento (Redis)**

```bash
# Conectar no Redis
docker exec -it openwa-redis redis-cli

# === FAQs Previdenciário ===
SET "lawapp:faq:auxilio-doenca" "O auxílio-doença é pra quem não consegue trabalhar temporariamente por doença. Precisa ter pelo menos 12 meses de contribuição ao INSS (salvo algumas exceções). Quer que eu agende uma consulta pra avaliar seu caso?"

SET "lawapp:faq:aposentadoria-invalidez" "A aposentadoria por invalidez é quando a pessoa não pode mais trabalhar de forma permanente. Precisa de perícia médica do INSS. Posso te ajudar a dar entrada no processo."

SET "lawapp:faq:pericia-inss" "A perícia do INSS avalia se você realmente está incapacitado pra trabalhar. O médico perito do INSS faz um exame e decide. Se negar, a gente entra na justiça."

SET "lawapp:faq:quanto-tempo-processo" "Processos no INSS levam de 3 a 12 meses em média. Depende da fila do tribunal e da complexidade do caso. Mas a gente acompanha tudo pra você!"

SET "lawapp:faq:documentos-necessarios" "Pra dar entrada você precisa: RG, CPF, comprovante de endereço, carteira de trabalho, laudos médicos e exames. Tem tudo isso aí?"

# === FAQs Família ===
SET "lawapp:faq:divorcio-consensual" "Divórcio consensual é quando os dois concordam em separar e já acertaram tudo (bens, pensão, etc). É mais rápido e barato. Vocês já conversaram sobre isso?"

SET "lawapp:faq:divisao-bens" "Se casaram sem fazer pacto antenupcial, a regra é dividir meio a meio tudo que foi comprado durante o casamento. Não importa quem pagou mais. Tem casa, carro, terreno?"

SET "lawapp:faq:pensao-alimenticia" "Pensão alimentícia é obrigação. A gente calcula baseado nas necessidades de quem recebe e na capacidade de quem paga. Tem filhos menores?"

SET "lawapp:faq:abandono-de-lar" "Sair de casa NÃO é abandono de lar. Você não perde direito aos bens por isso. Mas é bom formalizar a separação logo pra evitar problemas depois."

# === Processos Internos ===
SET "lawapp:horario-atendimento" "Nosso escritório funciona seg-sex, 9h-18h. Estou aqui 24h pra tirar dúvidas iniciais, mas pra consulta presencial preciso agendar. Qual melhor dia pra você?"

SET "lawapp:contato-escritorio" "WhatsApp do escritório: (88) 98178-8585. Se precisar falar urgente com alguém da equipe, é por ali!"

SET "lawapp:honorarios" "Os honorários a gente explica na primeira consulta, que é gratuita! Depende do tipo de processo. Quer agendar?"

# === Keywords para Detecção ===
SET "lawapp:keywords:auxilio" "auxilio,auxílio,beneficio,benefício,inss,doente,doença,afastado,incapacitado"
SET "lawapp:keywords:aposentadoria" "aposentadoria,aposentar,aposentado,invalidez,inválido"
SET "lawapp:keywords:pericia" "pericia,perícia,laudo,exame,médico perito"
SET "lawapp:keywords:divorcio" "divorcio,divórcio,separacao,separação,separar,largar"
SET "lawapp:keywords:bens" "bens,casa,carro,moto,terreno,imovel,imóvel,dividir,partilha"
SET "lawapp:keywords:pensao" "pensao,pensão,alimentos,alimenticia,alimentícia,filho"
SET "lawapp:keywords:urgente" "urgente,remedio,remédio,cirurgia,preciso,dinheiro,conta"
```

---

### **Nível 3: Workflow n8n (Diagrama Completo)**

```
┌────────────────────────────────────────────────────────┐
│ 1. Webhook (recebe mensagem WhatsApp)                  │
│    - POST do OpenWA                                    │
│    - Captura: chatId, body, from                       │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 2. Code: Normalizar Mensagem                           │
│    - Remove acentuação (pra busca)                     │
│    - Detecta palavras-chave                            │
│    - Extrai: tipo_solicitacao, urgencia, keywords      │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 3. Redis Get: Buscar FAQ                               │
│    - Se keywords batem com FAQ, busca resposta pronta  │
│    - Key: lawapp:faq:<categoria>                       │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 4. IF: FAQ encontrada?                                 │
├────────────────────────────────────────────────────────┤
│ ├─ SIM: LLM com contexto (FAQ + mensagem)             │
│ └─ NÃO: LLM sem contexto extra                        │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 5. Redis Get: Histórico do Cliente                     │
│    - Key: lawapp:cliente:<phone>                       │
│    - Últimas 5 mensagens do cliente                    │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 6. Code: Montar Prompt Final                           │
│    - System Prompt                                     │
│    - FAQ (se houver)                                   │
│    - Histórico (se houver)                             │
│    - Mensagem atual                                    │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 7. Basic LLM Chain (Groq)                              │
│    - Model: qwen/qwen3.6-27b                           │
│    - Contexto montado acima                            │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 8. Code: Analisar Resposta                             │
│    - Remove <think> tags                               │
│    - Detecta se precisa ação:                          │
│      • agendar_consulta                                │
│      • coletar_cpf                                     │
│      • escalar_para_humano                             │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 9. IF: Precisa Ação?                                   │
├────────────────────────────────────────────────────────┤
│ ├─ agendar_consulta: Webhook Calendly/Google Calendar │
│ ├─ coletar_cpf: Redis HSET cliente:<phone> cpf:XXX   │
│ └─ escalar_para_humano: Notificar equipe              │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 10. Redis Set: Salvar Histórico                        │
│     - Append mensagem atual                            │
│     - Expire: 7 dias                                   │
└────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────┐
│ 11. HTTP Request: Enviar WhatsApp                      │
│     - POST /api/sessions/.../messages/send-text        │
│     - chatId + text                                    │
└────────────────────────────────────────────────────────┘
```

---

### **Nível 4: Código dos Nodes Críticos**

#### **Node 2: Normalizar Mensagem**

```javascript
// Pegar mensagem do webhook
const message = $json.body.data.body.toLowerCase();
const chatId = $json.body.data.chatId;
const from = $json.body.data.from;

// Normalizar (remover acentos)
const normalize = (text) => {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
};

const normalized = normalize(message);

// Detectar tipo de solicitação
let tipo = 'geral';
let urgencia = false;

if (normalized.match(/auxilio|beneficio|inss|doenca|afastado/)) tipo = 'previdenciario';
if (normalized.match(/divorcio|separacao|bens|casa|carro/)) tipo = 'familia';
if (normalized.match(/processo|andamento|resultado|pericia|liberado/)) tipo = 'acompanhamento';
if (normalized.match(/urgente|remedio|cirurgia|preciso|dinheiro/)) urgencia = true;

// Extrair keywords para busca no Redis
const keywords = [
  { key: 'auxilio', match: /auxilio|beneficio/ },
  { key: 'aposentadoria', match: /aposentadoria|invalidez/ },
  { key: 'divorcio', match: /divorcio|separacao/ },
  { key: 'bens', match: /bens|casa|carro|dividir/ },
  { key: 'pericia', match: /pericia|laudo|exame/ },
  { key: 'pensao', match: /pensao|alimentos/ }
];

let categoria_faq = null;
for (const kw of keywords) {
  if (normalized.match(kw.match)) {
    categoria_faq = kw.key;
    break;
  }
}

return {
  json: {
    message: message,
    normalized: normalized,
    chatId: chatId,
    from: from,
    tipo: tipo,
    urgencia: urgencia,
    categoria_faq: categoria_faq
  }
};
```

#### **Node 6: Montar Prompt Final**

```javascript
// System Prompt
const systemPrompt = `Você é assistente virtual do escritório Dr. Dênis Bernardo (Lawapp).

Tom: informal, respeitoso, empático.
Respostas: máx 3 frases curtas.
Erros do cliente: entenda contexto, responda normal.
Limites: não dê consultoria jurídica, apenas orientações gerais.`;

// FAQ (se encontrada no Redis)
const faq = $('Redis Get').item?.json?.value || null;
let faqContext = '';
if (faq) {
  faqContext = `\n\nINFORMAÇÃO RELEVANTE:\n${faq}\n\nUse essa informação pra responder a pergunta do cliente.`;
}

// Histórico (se existir)
const historico = $('Redis Get Histórico').item?.json?.value || null;
let historyContext = '';
if (historico) {
  const msgs = JSON.parse(historico);
  historyContext = `\n\nÚLTIMAS MENSAGENS DO CLIENTE:\n${msgs.map(m => `- ${m}`).join('\n')}`;
}

// Mensagem atual
const mensagemAtual = $('Code: Normalizar Mensagem').item.json.message;
const tipo = $('Code: Normalizar Mensagem').item.json.tipo;
const urgencia = $('Code: Normalizar Mensagem').item.json.urgencia;

// Urgência (ajustar prompt)
let urgenciaFlag = '';
if (urgencia) {
  urgenciaFlag = '\n\n⚠️ CLIENTE EM SITUAÇÃO DE URGÊNCIA! Priorize empatia e rapidez.';
}

// Montar prompt final
const userPrompt = `${historyContext}${faqContext}${urgenciaFlag}

TIPO DA SOLICITAÇÃO: ${tipo}

MENSAGEM DO CLIENTE:
"${mensagemAtual}"

Responda de forma clara, curta (máx 3 frases) e empática.`;

return {
  json: {
    system: systemPrompt,
    user: userPrompt
  }
};
```

#### **Node 8: Analisar Resposta**

```javascript
// Pegar resposta do LLM
let text = $input.first().json.text;

// Remover tags <think>
text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// Detectar se precisa ação
let acao = null;

if (text.match(/quer agendar|posso agendar|marcar consulta/i)) {
  acao = 'agendar_consulta';
}

if (text.match(/qual seu cpf|me passa o cpf|preciso do cpf/i)) {
  acao = 'coletar_cpf';
}

if (text.match(/vou anotar|dr\.? denis te responde|falar com advogado/i)) {
  acao = 'escalar_para_humano';
}

// Retornar
const chatId = $item("0").$node["Webhook"].json["body"]["data"]["chatId"];

return {
  json: {
    chatId: chatId,
    text: text,
    acao: acao
  }
};
```

---

## 🚀 Implementação por Etapas

### **Fase 1: MVP Básico (1h)**
- [x] Webhook funcionando ✅
- [x] LLM respondendo ✅
- [ ] System Prompt aprimorado ⏭️ **PRÓXIMO**
- [ ] Teste com 3 conversas reais

### **Fase 2: Inteligência (2h)**
- [ ] Redis com FAQs principais
- [ ] Detecção de keywords
- [ ] Histórico de conversa (7 dias)

### **Fase 3: Ações (3h)**
- [ ] Agendar consulta (Google Calendar)
- [ ] Coletar CPF/dados no Redis
- [ ] Escalar para humano (notificação Telegram/Email)

### **Fase 4: Qualidade (2h)**
- [ ] Lidar com áudios (transcrição via Whisper)
- [ ] Respostas em áudio (TTS)
- [ ] Testes A/B com clientes reais

---

## 📋 Checklist de Qualidade

Antes de colocar em produção:

- [ ] Bot entende mensagens com erros de português?
- [ ] Bot responde em no máximo 3 frases?
- [ ] Bot usa tom informal mas respeitoso?
- [ ] Bot não inventa informações?
- [ ] Bot escala para humano quando não sabe?
- [ ] Bot detecta urgência e prioriza?
- [ ] Bot mantém contexto de conversas anteriores?
- [ ] Bot coleta dados estruturados (CPF, nome)?
- [ ] Bot oferece agendar consulta?
- [ ] Bot responde em até 5 segundos?

---

## 🎬 Próxima Ação

**Qual fase você quer implementar primeiro?**

1. **Melhorar o System Prompt** (5min) — testamos com mensagens reais agora
2. **Adicionar FAQs no Redis** (15min) — bot responde com conhecimento específico
3. **Adicionar histórico de conversa** (20min) — contexto entre mensagens
4. **Criar ações automáticas** (1h) — agendar consulta, coletar CPF

**Recomendação:** Começar pelo #1 (System Prompt), testar, depois #2 (FAQs).
