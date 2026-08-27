# 🧠 Como Alimentar o Bot com Conhecimento

## 📋 Opções de Base de Conhecimento

### ✅ Opção 1: Redis (Simples - RECOMENDADO para começar)

**Vantagens:**
- Já temos Redis rodando
- Rápido
- Fácil de atualizar

**Como usar:**

```bash
# 1. Conectar no Redis
docker exec -it openwa-redis redis-cli

# 2. Adicionar conhecimento (FAQs)
SET "lawapp:faq:preco" "O Lawapp tem planos a partir de R$ 97/mês. Quer agendar uma demo para ver todos os recursos?"

SET "lawapp:faq:funcionalidades" "O Lawapp oferece: gestão de processos, controle de prazos, geração de documentos, relatórios e integração com tribunais."

SET "lawapp:faq:suporte" "Nosso suporte funciona seg-sex, 9h-18h. Posso abrir um chamado para você?"

SET "lawapp:faq:demonstracao" "Posso agendar uma demonstração gratuita de 30min. Qual seu email e melhor horário?"

# 3. Testar
GET "lawapp:faq:preco"
```

---

### ✅ Opção 2: Arquivo JSON (Médio)

Criar arquivo `lawapp-knowledge.json`:

```json
{
  "funcionalidades": {
    "gestao_processos": "Acompanhe todos os processos em um só lugar",
    "prazos": "Alertas automáticos de prazos importantes",
    "documentos": "Geração automática de petições e documentos"
  },
  "precos": {
    "basico": "R$ 97/mês - até 50 processos",
    "profissional": "R$ 197/mês - processos ilimitados",
    "escritorio": "R$ 497/mês - múltiplos usuários"
  },
  "intencoes": {
    "agendar_demo": [
      "quero demonstracao",
      "agendar demo",
      "testar gratis",
      "conhecer o sistema"
    ],
    "abrir_chamado": [
      "preciso de ajuda",
      "suporte",
      "problema",
      "nao funciona"
    ],
    "consultar_preco": [
      "quanto custa",
      "preco",
      "valor",
      "planos"
    ]
  }
}
```

**No n8n:**
- Adicionar node "HTTP Request" para ler o arquivo
- Ou node "Read/Write File" se estiver no mesmo server

---

### ✅ Opção 3: PostgreSQL (Avançado)

Criar tabela de conhecimento:

```sql
CREATE TABLE lawapp_knowledge (
  id SERIAL PRIMARY KEY,
  categoria VARCHAR(100),
  pergunta TEXT,
  resposta TEXT,
  keywords TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Inserir conhecimento
INSERT INTO lawapp_knowledge (categoria, pergunta, resposta, keywords) VALUES
('preco', 'Quanto custa o Lawapp?', 'Planos a partir de R$ 97/mês...', ARRAY['preco', 'valor', 'quanto custa']),
('funcionalidades', 'O que o Lawapp faz?', 'Gestão de processos...', ARRAY['funcionalidades', 'recursos', 'o que faz']);
```

**No n8n:**
- Adicionar node "Postgres"
- Query: `SELECT resposta FROM lawapp_knowledge WHERE '{{ $json.body.data.body }}' ILIKE ANY(keywords)`

---

## 🎯 Workflow Completo: Bot com Conhecimento

```
┌─────────────────────────────────────────────────────┐
│ Webhook (recebe mensagem)                           │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Code: Extrair palavras-chave                        │
│ - "preco" → buscar faq:preco                        │
│ - "funcionalidades" → buscar faq:funcionalidades    │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Redis Get (buscar conhecimento)                     │
│ Key: lawapp:faq:{{ $json.keyword }}                 │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ IF (encontrou conhecimento?)                        │
│ ├─ SIM → Code: montar prompt com conhecimento       │
│ └─ NÃO → LLM responde sem contexto extra            │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Basic LLM Chain                                     │
│ System: Você é assistente Lawapp...                │
│ User: {{ mensagem }} + {{ conhecimento }}           │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ Code (limpar resposta)                              │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ HTTP Request (enviar WhatsApp)                      │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Próximos Passos

1. **Agora:** Melhore o System Prompt (5min)
2. **Hoje:** Adicione FAQs no Redis (15min)
3. **Amanhã:** Crie workflow com IF para ações (30min)
4. **Esta semana:** Integre com API do LawApp (1-2h)

---

## 📝 Exemplo de Conversa Melhorada

**ANTES:**
```
Usuário: qanto csta o lawap?
Bot: Desculpe, não entendi sua pergunta.
```

**DEPOIS (com conhecimento):**
```
Usuário: qanto csta o lawap?
Bot: O Lawapp tem planos a partir de R$ 97/mês! 
     Quer que eu agende uma demonstração gratuita pra você conhecer? 😊
```

---

**Quer que eu implemente qual opção primeiro?**
- [ ] Melhorar o System Prompt (rápido)
- [ ] Adicionar Redis com FAQs (médio)
- [ ] Criar workflow com ações (avançado)
