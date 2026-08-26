#!/bin/bash
# 🚀 Setup automático do Chatbot LLM para OpenWA

set -e

echo "🤖 ============================================"
echo "   Setup Chatbot LLM - OpenWA"
echo "============================================"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configurações
API_KEY="owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"
SESSION_ID="75a54c72-fade-48af-9059-cf56362df076"
WEBHOOK_PORT=3001

# ========================================
# 1. Verificar dependências
# ========================================
echo "📦 [1/5] Verificando dependências..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado!${NC}"
    echo "   Instale com: brew install node"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm não encontrado!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node --version)${NC}"
echo -e "${GREEN}✅ npm $(npm --version)${NC}"

# ========================================
# 2. Instalar pacotes npm
# ========================================
echo ""
echo "📦 [2/5] Instalando pacotes npm..."

if [ ! -d "node_modules" ]; then
    npm install express axios ioredis --silent
    echo -e "${GREEN}✅ Pacotes instalados${NC}"
else
    echo -e "${YELLOW}⏭️  node_modules já existe, pulando...${NC}"
fi

# ========================================
# 3. Verificar .env
# ========================================
echo ""
echo "🔑 [3/5] Verificando variáveis de ambiente..."

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env não encontrado, criando...${NC}"
    cat > .env << EOF
# API Keys
OPENWA_API_KEY=owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc
SESSION_ID=75a54c72-fade-48af-9059-cf56362df076

# LLM Providers (configure pelo menos um)
GROQ_API_KEY=gsk_YOUR_KEY_HERE
# OPENAI_API_KEY=sk-YOUR_KEY_HERE
# ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE

# Redis (usar o do OpenWA)
REDIS_HOST=localhost
REDIS_PORT=6379
EOF
    echo -e "${GREEN}✅ Arquivo .env criado${NC}"
    echo -e "${YELLOW}⚠️  Configure suas API keys no arquivo .env${NC}"
else
    echo -e "${GREEN}✅ Arquivo .env existe${NC}"
fi

# Carregar .env
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Verificar se pelo menos uma API key está configurada
if [[ "$GROQ_API_KEY" == "gsk_YOUR_KEY_HERE" ]] && \
   [[ -z "$OPENAI_API_KEY" || "$OPENAI_API_KEY" == "sk-YOUR_KEY_HERE" ]] && \
   [[ -z "$ANTHROPIC_API_KEY" || "$ANTHROPIC_API_KEY" == "sk-ant-YOUR_KEY_HERE" ]]; then
    echo -e "${RED}❌ Nenhuma API key LLM configurada!${NC}"
    echo "   Configure pelo menos uma em .env:"
    echo "   - GROQ_API_KEY (recomendado - https://console.groq.com/keys)"
    echo "   - OPENAI_API_KEY (https://platform.openai.com/api-keys)"
    echo "   - ANTHROPIC_API_KEY (https://console.anthropic.com/)"
    exit 1
fi

echo -e "${GREEN}✅ API keys configuradas${NC}"

# ========================================
# 4. Verificar OpenWA
# ========================================
echo ""
echo "🔍 [4/5] Verificando OpenWA..."

if ! curl -s http://localhost:2785/api/health > /dev/null; then
    echo -e "${RED}❌ OpenWA não está respondendo em http://localhost:2785${NC}"
    echo "   Inicie o OpenWA com: docker compose up -d"
    exit 1
fi

echo -e "${GREEN}✅ OpenWA está rodando${NC}"

# Verificar sessão
SESSION_STATUS=$(curl -s -H "x-api-key: $API_KEY" \
    "http://localhost:2785/api/sessions/$SESSION_ID" | jq -r '.status' 2>/dev/null || echo "error")

if [ "$SESSION_STATUS" == "ready" ]; then
    echo -e "${GREEN}✅ Sessão WhatsApp conectada${NC}"
elif [ "$SESSION_STATUS" == "error" ]; then
    echo -e "${RED}❌ Erro ao verificar sessão${NC}"
    exit 1
else
    echo -e "${YELLOW}⚠️  Sessão WhatsApp: $SESSION_STATUS${NC}"
fi

# ========================================
# 5. Registrar webhook
# ========================================
echo ""
echo "🔗 [5/5] Registrando webhook no OpenWA..."

# Remover webhooks existentes
WEBHOOKS=$(curl -s -H "x-api-key: $API_KEY" \
    "http://localhost:2785/api/sessions/$SESSION_ID/webhooks")

if [ "$WEBHOOKS" != "[]" ]; then
    echo -e "${YELLOW}⚠️  Removendo webhooks existentes...${NC}"
    # TODO: implementar remoção se necessário
fi

# Registrar novo webhook
WEBHOOK_RESPONSE=$(curl -s -X POST \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
        \"url\": \"http://host.docker.internal:$WEBHOOK_PORT/webhook/message\",
        \"events\": [\"message\"],
        \"enabled\": true
    }" \
    "http://localhost:2785/api/sessions/$SESSION_ID/webhooks")

if echo "$WEBHOOK_RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
    WEBHOOK_ID=$(echo "$WEBHOOK_RESPONSE" | jq -r '.id')
    echo -e "${GREEN}✅ Webhook registrado (ID: $WEBHOOK_ID)${NC}"
else
    echo -e "${YELLOW}⚠️  Webhook pode já estar registrado${NC}"
    echo "   Resposta: $WEBHOOK_RESPONSE"
fi

# ========================================
# Finalização
# ========================================
echo ""
echo -e "${GREEN}✅ Setup concluído!${NC}"
echo ""
echo "🚀 Para iniciar o chatbot, execute:"
echo -e "   ${GREEN}node webhook-llm-handler.js${NC}"
echo ""
echo "📊 Ou execute em background com PM2:"
echo -e "   ${GREEN}npm install -g pm2${NC}"
echo -e "   ${GREEN}pm2 start webhook-llm-handler.js --name openwa-chatbot${NC}"
echo -e "   ${GREEN}pm2 logs openwa-chatbot${NC}"
echo ""
echo "🧪 Teste enviando mensagem para: +1 (321) 488-5868"
echo ""
