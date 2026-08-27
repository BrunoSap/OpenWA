# Guia de Instalação de Plugins OpenWA

## 📦 Instalar Plugins do Repositório OpenWA-plugins

Este guia mostra como instalar os plugins oficiais do [repositório OpenWA-plugins](https://github.com/rmyndharis/OpenWA-plugins) no seu container Docker.

---

## ✅ Pré-requisitos

- Container OpenWA rodando (via `docker compose up`)
- Acesso ao dashboard (porta 2785 por padrão)
- API key com permissão **ADMIN** (gerada no dashboard)

---

## 🎯 Métodos de Instalação

### **Método 1: Via Dashboard (Recomendado)**

A forma mais simples e visual:

1. **Acesse o Dashboard**
   ```
   http://localhost:2785
   ```

2. **Navegue até Plugins**
   - Menu lateral → **Plugins**

3. **Instale o Plugin**

   **Opção A - Do Catálogo Oficial:**
   - Clique em **Catalog**
   - Procure o plugin desejado
   - Clique em **Install**

   **Opção B - Upload Manual:**
   - Baixe o `.zip` do [repositório](https://github.com/rmyndharis/OpenWA-plugins/releases)
   - Clique em **Upload Plugin**
   - Selecione o arquivo `.zip`
   - Clique em **Install**

   **Opção C - Por URL:**
   - Clique em **Install from URL**
   - Cole a URL do release (ex: `https://github.com/rmyndharis/OpenWA-plugins/releases/download/chatwoot-adapter-v0.9.5/chatwoot-adapter.zip`)
   - Clique em **Install**

4. **Ative o Plugin**
   - Após instalação, clique em **Enable**
   - Configure as sessões que usarão o plugin
   - Configure os parâmetros necessários

---

### **Método 2: Via API REST**

Para automação e integração:

```bash
# 1. Obtenha sua API key ADMIN do dashboard
ADMIN_KEY="sua-chave-admin-aqui"
BASE_URL="http://localhost:2785/api"

# 2. Instalar por URL (exemplo: chatwoot-adapter)
curl -X POST $BASE_URL/plugins/install-url \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/rmyndharis/OpenWA-plugins/releases/download/chatwoot-adapter-v0.9.5/chatwoot-adapter.zip"
  }'

# 3. Ou instalar por upload de arquivo
curl -X POST $BASE_URL/plugins/install \
  -H "x-api-key: $ADMIN_KEY" \
  -F "file=@./chatwoot-adapter.zip"

# 4. Listar plugins instalados
curl -X GET $BASE_URL/plugins \
  -H "x-api-key: $ADMIN_KEY"

# 5. Ativar o plugin
PLUGIN_ID="chatwoot-adapter"
curl -X POST $BASE_URL/plugins/$PLUGIN_ID/enable \
  -H "x-api-key: $ADMIN_KEY"

# 6. Configurar o plugin
curl -X PUT $BASE_URL/plugins/$PLUGIN_ID/config \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "chatwootUrl": "https://app.chatwoot.com",
    "accountId": "1",
    "apiKey": "sua-chave-chatwoot"
  }'

# 7. Ativar para sessões específicas (ou '*' para todas)
curl -X PUT $BASE_URL/plugins/$PLUGIN_ID/sessions \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessions": ["*"]
  }'
```

---

### **Método 3: Volume Docker (Manual)**

Para desenvolvedores que querem instalar diretamente no volume:

```bash
# 1. Entre no container
docker exec -it openwa-api sh

# 2. Navegue até o diretório de plugins
cd /app/data/plugins

# 3. Baixe e extraia o plugin
# Exemplo: chatwoot-adapter
wget https://github.com/rmyndharis/OpenWA-plugins/releases/download/chatwoot-adapter-v0.9.5/chatwoot-adapter.zip
unzip chatwoot-adapter.zip -d chatwoot-adapter
rm chatwoot-adapter.zip

# 4. Ajuste permissões (o entrypoint faz isso no boot, mas por segurança)
chown -R openwa:openwa /app/data/plugins

# 5. Saia do container
exit

# 6. Reinicie o container para o plugin ser detectado
docker compose restart openwa-api

# 7. Ative o plugin pelo dashboard ou API
```

**⚠️ Nota:** Este método requer reinicialização e é menos recomendado.

---

## 📚 Plugins Disponíveis

Plugins oficiais do [repositório OpenWA-plugins](https://github.com/rmyndharis/OpenWA-plugins):

| Plugin | Versão | Descrição |
|--------|--------|-----------|
| **after-hours** | v0.2.5 | Resposta automática fora do horário comercial |
| **chat-flow** | v1.1.6 | Conversas interativas com menus numerados |
| **chatwoot-adapter** | v0.9.5 | Integração bidirecional com Chatwoot |
| **faq-bot** | v0.2.5 | Respostas automáticas baseadas em keywords/regex |
| **group-translate** | v1.3.5 | Tradução de mensagens de grupo (LibreTranslate) |
| **gsheets-logger** | v0.3.7 | Log de eventos no Google Sheets |
| **http-action** | v0.2.6 | Executa chamadas REST via comandos WhatsApp |
| **supabase-otp-hook** | v0.3.4 | Entrega OTPs do Supabase Auth via WhatsApp |
| **typebot-connector** | v0.2.6 | Executa flows do Typebot como conversas |
| **voice-transcription** | v1.2.7 | Transcrição de áudio via OpenAI/Groq/Whisper |

---

## 🔐 Segurança

### **Permissões Necessárias**

Cada plugin declara suas permissões no `manifest.json`. Exemplo:

```json
{
  "permissions": [
    "messages:send",     // Enviar mensagens
    "engine:read",       // Ler contatos/grupos
    "net:fetch",         // Chamadas HTTP externas
    "storage:use",       // Persistir dados
    "webhook:ingress",   // Receber webhooks
    "conversation:send", // Gerenciar conversas
    "search:provide"     // Prover busca
  ]
}
```

### **Sandbox de Segurança**

- Plugins rodam em `worker_thread` isolado
- Heap limitado a **256 MB** por plugin
- Timeout de **5s** para handlers de hooks
- Timeout de **30s** para lifecycle methods
- Filtro SSRF para chamadas HTTP externas
- Apenas hosts declarados em `net.allow` são permitidos

### **⚠️ Importante**

> **Instale apenas plugins confiáveis!** Plugins têm acesso a Node.js built-ins (`fs`, `net`, etc.) dentro do sandbox. O modelo de segurança é **contenção**, não isolamento total.

---

## 🔧 Configuração Avançada

### **Configuração Por Sessão**

Você pode ter configurações diferentes para cada sessão:

```bash
# Configuração base (todos)
curl -X PUT $BASE_URL/plugins/faq-bot/config \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "rules": [
      {"match": "horário", "reply": "Atendemos 9h-18h"}
    ]
  }'

# Sobrescrever para uma sessão específica
SESSION_ID="5511999999999"
curl -X PUT $BASE_URL/plugins/faq-bot/config/$SESSION_ID \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "rules": [
      {"match": "horário", "reply": "Atendemos 24h"}
    ]
  }'
```

### **Verificação de Saúde**

```bash
# Checar se o plugin está funcionando
curl -X GET $BASE_URL/plugins/chatwoot-adapter/health \
  -H "x-api-key: $ADMIN_KEY"
```

### **Atualização de Plugin**

```bash
# Atualizar plugin instalado preservando config
PLUGIN_ID="chatwoot-adapter"
NEW_VERSION_URL="https://github.com/rmyndharis/OpenWA-plugins/releases/download/chatwoot-adapter-v0.10.0/chatwoot-adapter.zip"

curl -X POST $BASE_URL/plugins/$PLUGIN_ID/update \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$NEW_VERSION_URL\"}"
```

---

## 🐛 Troubleshooting

### **Plugin não aparece após instalação**

1. Verifique os logs:
   ```bash
   docker logs openwa-api --tail 100
   ```

2. Certifique-se que o `manifest.json` está correto
3. Reinicie o container se instalou via volume

### **Plugin falha ao ativar**

- Verifique se o plugin tem todas as **dependências** necessárias
- Confira se as **permissões** declaradas estão corretas
- Verifique se há **erros de sintaxe** no código do plugin

### **Timeout em hooks**

Plugins têm **5s** para processar hooks. Se ultrapassar:
- Otimize o código do plugin
- Evite operações bloqueantes síncronas
- Use `ctx.storage` em vez de DB externa quando possível

### **Erro de permissão**

```
PluginCapabilityError: Plugin X is missing 'messages:send' permission
```

**Solução:** Adicione a permissão no `manifest.json` e reinstale:
```json
{
  "permissions": ["messages:send"]
}
```

---

## 📖 Referências

- [OpenWA Main Repository](https://github.com/rmyndharis/OpenWA)
- [OpenWA-plugins Repository](https://github.com/rmyndharis/OpenWA-plugins)
- [Plugin Architecture Documentation](https://github.com/rmyndharis/OpenWA/blob/main/docs/19-plugin-architecture.md)
- [Plugin Sandboxing Documentation](https://github.com/rmyndharis/OpenWA/blob/main/docs/30-plugin-sandboxing.md)

---

## 🎓 Próximos Passos

Após instalar os plugins:

1. **Configure webhooks** para receber eventos dos plugins
2. **Teste em ambiente de desenvolvimento** antes de produção
3. **Monitore logs** para detectar problemas
4. **Ajuste timeouts** se necessário via variáveis de ambiente
5. **Crie backups** da configuração dos plugins

---

**Licença:** MIT  
**Suporte:** [GitHub Issues](https://github.com/rmyndharis/OpenWA/issues)
