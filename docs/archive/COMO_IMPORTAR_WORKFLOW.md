# 🚀 Como Importar o Workflow Melhorado

## 📋 O Que Foi Implementado

### ✅ **Melhorias Críticas**

| # | Node | O Que Faz | Por Que É Importante |
|---|------|-----------|---------------------|
| 1 | **Normalizar Mensagem** | Detecta tipo de solicitação, urgência, categoria | Entende contexto ANTES do LLM |
| 2 | **Montar Prompt Inteligente** | Cria System + User prompt adaptado ao caso | LLM recebe contexto rico |
| 3 | **Basic LLM Chain** | Processa com Groq (qwen 27b) | Gera resposta inteligente |
| 4 | **Limpar Resposta** | Remove `<think>` e detecta se pediu ação | Resposta limpa + próximos passos |
| 5 | **Enviar WhatsApp** | POST pro OpenWA | Cliente recebe no WhatsApp |

---

## 🎯 Inteligência Implementada

### **1. Detecção Automática de Contexto**

```javascript
// O bot agora detecta automaticamente:

✅ TIPO:
- Previdenciário (INSS, auxílio, aposentadoria)
- Família (divórcio, separação, bens)
- Acompanhamento (status de processo)

✅ URGÊNCIA:
- Detecta: "remédio", "cirurgia", "preciso", "urgente"
- Ajusta tom da resposta automaticamente

✅ CATEGORIA:
- Auxílio-doença
- Aposentadoria
- Perícia
- Divórcio
- Divisão de bens
- Pensão alimentícia
```

### **2. System Prompt Profissional**

```markdown
✅ Tom informal mas respeitoso
✅ Máximo 2-3 frases
✅ Lida com erros de português
✅ Não inventa informações
✅ Oferece próximos passos
✅ Sempre termina oferecendo ajuda
```

### **3. Contexto Dinâmico por Categoria**

```javascript
// Exemplo: Cliente pergunta sobre divórcio
→ Bot recebe contexto: "Bens dividem meio a meio, perguntar sobre filhos"

// Exemplo: Cliente urgente (remédio)
→ Bot recebe: "⚠️ URGÊNCIA! Priorize empatia e rapidez"
```

### **4. Detecção de Ações**

```javascript
// Bot detecta se precisa:
- coletar_cpf → Para consultar processo
- agendar_consulta → Para atendimento presencial
- escalar_humano → Para casos complexos
```

---

## 📥 Como Importar

### **Passo 1: Backup do Workflow Atual**

1. Abra n8n: http://localhost:5678
2. Abra seu workflow "Whatsapp LLM Bot"
3. Menu **⋮** (três pontos) → **Download**
4. Salve como backup: `Whatsapp-LLM-Bot-BACKUP.json`

### **Passo 2: Importar Workflow Melhorado**

1. No n8n, clique em **Workflows** (menu lateral)
2. Clique em **+ Add workflow**
3. Menu **⋮** → **Import from File**
4. Selecione: `/Users/I531631/claude/Pessoal/OpenWA/Whatsapp-LLM-Bot-MELHORADO.json`
5. Clique em **Import**

### **Passo 3: Configurar Credenciais**

O workflow importado já tem os IDs das suas credenciais:

✅ **Groq API** (id: 4H66gdwqyInkOE5m) - já configurado
✅ **Header Auth** (id: YXggRCXzzkjcD2MN) - já configurado

**Se der erro de credencial:**
1. Clique no node "Groq Chat Model"
2. Em **Credentials**, selecione "Groq account"
3. Clique em "5. Enviar WhatsApp"
4. Em **Credentials**, selecione "Header Auth account"

### **Passo 4: Ativar Workflow**

1. Toggle **Active** (canto superior direito)
2. Verifique se ficou **verde** ✅

---

## 🧪 Testar Agora

### **Teste 1: Mensagem com Erros de Português**

Envie pelo WhatsApp:
```
qanto csta o lawap eu presiso sabe si tem como mim ajuda com o inss
```

**Resultado esperado:**
```
A consulta é gratuita! A gente te ajuda sim com o INSS.

É sobre auxílio-doença ou aposentadoria? Me conta mais sobre seu caso. 😊
```

**O que aconteceu nos bastidores:**
1. Node 1 detectou: `tipo=previdenciario`, `categoria=auxilio-doenca`
2. Node 2 adicionou contexto: "Auxílio é para incapacidade temporária"
3. LLM respondeu com linguagem simples
4. Cliente recebeu resposta clara

---

### **Teste 2: Urgência (Remédio)**

Envie:
```
Boa tarde Dr denes. Eu queria saber como está o meu auxílio. Não foi mais liberado nada. Porém tô precisando pra comprar meus remédios
```

**Resultado esperado:**
```
Entendo que tá precisando urgente! 🙏

Deixa eu ver seu processo aqui. Qual seu CPF pra eu consultar?

Vou priorizar seu atendimento.
```

**O que aconteceu:**
1. Node 1 detectou: `urgencia=true`, `tipo=acompanhamento`, `precisaCPF=true`
2. Node 2 adicionou: "⚠️ URGÊNCIA DETECTADA! Priorize empatia"
3. LLM respondeu com urgência e pediu CPF
4. Node 4 detectou ação: `coletar_cpf`

---

### **Teste 3: Dúvida Jurídica (Divórcio)**

Envie:
```
Eu sou casada 20 anos e agora separei a 4 meses. Tenho uma casa e um carro. Como fica a divisão?
```

**Resultado esperado:**
```
Em geral os bens construídos durante o casamento são divididos meio a meio.

Quer agendar uma consulta gratuita pro Dr. Denis avaliar direitinho o seu caso? 😊
```

**O que aconteceu:**
1. Node 1 detectou: `tipo=familia`, `categoria=divisao-bens`
2. Node 2 adicionou contexto: "Sair de casa NÃO é abandono"
3. LLM respondeu com orientação geral
4. Ofereceu agendar consulta

---

## 🔍 Como Verificar se Funcionou

### **1. Ver Execuções**

1. No n8n, menu lateral → **Executions**
2. Clique na última execução
3. Veja cada node:

```
✅ Node 1: Detectou tipo e urgência?
✅ Node 2: Montou prompt com contexto?
✅ Node 3: LLM respondeu?
✅ Node 4: Limpou resposta?
✅ Node 5: Enviou pro WhatsApp?
```

### **2. Ver Dados Detectados**

Clique em **Node 1 (Normalizar Mensagem)** na execução:

```json
{
  "messageOriginal": "qanto csta o lawap",
  "tipo": "geral",
  "categoria": null,
  "urgencia": false,
  "precisaCPF": false
}
```

---

## 🆚 Comparação: Antes vs Depois

| Aspecto | Workflow Antigo | Workflow Novo |
|---------|-----------------|---------------|
| **System Prompt** | Genérico, encoding errado | Profissional, regras claras |
| **Contexto** | Zero | Detecta tipo, urgência, categoria |
| **Erros de português** | Ignora | Normaliza e entende |
| **Urgência** | Não detecta | Detecta e prioriza |
| **Respostas** | Longas, técnicas | Curtas, simples (2-3 frases) |
| **Próximos passos** | Não sugere | Oferece agendar, coletar CPF |
| **Ações** | Nenhuma | Detecta 3 tipos de ação |

---

## 🎬 Próximas Fases (Após Testar)

### **Fase 2: Redis com FAQs** (15min)
- Respostas prontas para perguntas comuns
- Histórico de conversa (contexto entre mensagens)

### **Fase 3: Transcrição de Áudio** (30min)
- Whisper API (Groq ou OpenAI)
- Cliente manda áudio → Bot transcreve → Processa

### **Fase 4: Upload de Documentos** (1h)
- Cliente manda PDF/imagem
- Bot salva em S3/Drive
- Notifica equipe

### **Fase 5: Consulta Automática de Status** (2h)
- Integração com PostgreSQL ou API Lawapp
- Bot consulta processo por CPF
- Responde: "Seu processo está em análise. Perícia dia 15/09."

---

## ✅ Checklist de Validação

Antes de colocar em produção:

- [ ] Importou workflow novo?
- [ ] Credenciais Groq e OpenWA configuradas?
- [ ] Workflow ativado (toggle verde)?
- [ ] Testou mensagem com erros de português?
- [ ] Testou mensagem de urgência?
- [ ] Testou dúvida jurídica?
- [ ] Viu execuções no n8n?
- [ ] Bot respondeu em 2-3 frases?
- [ ] Bot ofereceu próximos passos?
- [ ] Tom ficou informal mas respeitoso?

---

## 🐛 Troubleshooting

### Erro: "Credential not found"
**Solução:** Reconfigure manualmente:
1. Node "Groq Chat Model" → Credentials → "Groq account"
2. Node "5. Enviar WhatsApp" → Credentials → "Header Auth account"

### Erro: "Webhook not registered"
**Solução:** O webhook ID é o mesmo (71e84c0d...), deve funcionar.
Se não funcionar:
1. Copie a Production URL do webhook
2. Atualize no dashboard do OpenWA

### Bot não responde
**Solução:**
1. Veja **Executions** → última execução
2. Identifique qual node falhou
3. Clique no node com erro → veja mensagem

### Resposta vem em inglês
**Solução:** System prompt tem "SEMPRE em português-BR", mas verifique:
1. Node 2 → veja `systemPrompt` gerado
2. Confirme que tem "Responda SEMPRE em português-BR"

---

## 📊 Métricas de Sucesso

Após 1 semana em produção:

- **Taxa de compreensão**: Bot entende mensagens com erros? (meta: >90%)
- **Tempo de resposta**: Quanto tempo até responder? (meta: <5s)
- **Taxa de escalação**: Quantos % escalam pra humano? (meta: <30%)
- **Satisfação**: Clientes agradecem? Usam emojis? (meta: >80%)

---

**Pronto para testar!** 🚀

Importe o workflow, teste as 3 mensagens acima e me fala como foi!
