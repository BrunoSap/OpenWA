# Solução: Erro de Credencial no n8n com OpenWA

## Problema

Erro ao executar workflow n8n que envia mensagens WhatsApp via OpenWA:

```
"errorMessage": "Credential with ID \"YXggRCXzzkjcD2MN\" does not exist for type \"httpHeaderAuth\"."
```

**Causa Raiz:** A credencial HTTP Header Auth configurada no node "Enviar WhatsApp" foi excluída ou corrompida no banco de dados do n8n. O ID `YXggRCXzzkjcD2MN` não existe mais.

## Solução Passo-a-Passo

### 1. Obter a API Key do OpenWA

A API key está armazenada no container OpenWA:

```bash
# Extrair API key
docker exec openwa-openwa-api-1 cat /app/data/.api-key
```

**API Key atual:**
```
owa_k1_5161945eee8231c0a6dcce6d70db910184b8e16febdb4f6ac4d2dbde6d127466
```

**Validar que está funcionando:**
```bash
API_KEY="owa_k1_5161945eee8231c0a6dcce6d70db910184b8e16febdb4f6ac4d2dbde6d127466"
curl -H "x-api-key: $API_KEY" http://localhost:2785/api/sessions | jq .
```

Deve retornar a lista de sessões WhatsApp ativas.

### 2. Recriar a Credencial no n8n

1. **Acesse o n8n:** http://localhost:5678
   - Usuário: `admin`
   - Senha: `admin123` (ou conforme configurado)

2. **Vá para Credentials:**
   - Menu lateral → **Credentials**

3. **Crie nova credencial HTTP Header Auth:**
   - Clique em **+ New Credential**
   - Busque e selecione: **Header Auth**
   - Preencha:
     - **Name:** `OpenWA API Auth` (ou nome descritivo)
     - **Header Name:** `x-api-key`
     - **Header Value:** `owa_k1_5161945eee8231c0a6dcce6d70db910184b8e16febdb4f6ac4d2dbde6d127466`
   - Clique em **Save**

### 3. Atualizar o Workflow

1. **Abra o workflow com erro** (o que envia mensagens WhatsApp)

2. **Localize o node "Enviar WhatsApp"** (HTTP Request node)

3. **Atualizar credencial:**
   - Clique no node
   - Na aba **Authentication**
   - Em **Credential to connect with**, selecione a credencial recém-criada: `OpenWA API Auth`
   - **Salve o workflow**

### 4. Testar o Workflow

Execute o workflow manualmente:

1. Clique em **Execute Workflow**
2. Monitore a execução
3. Verifique se o erro desapareceu

**Payload de teste para enviar mensagem:**
```json
{
  "chatId": "5511999999999@c.us",
  "text": "Teste de mensagem via n8n"
}
```

## Configuração Completa do Node HTTP Request

Para referência, a configuração correta do node "Enviar WhatsApp":

```yaml
Method: POST
URL: http://openwa-api:2785/api/sessions/ccc077d7-481c-4cbb-8997-ba6c2b1720fc/messages/send-text

Authentication: Header Auth
  - Credential: OpenWA API Auth
  - Header Name: x-api-key
  - Header Value: owa_k1_5161945eee8231c0a6dcce6d70db910184b8e16febdb4f6ac4d2dbde6d127466

Body:
  - Content-Type: application/json
  - Body: {{ $json }}
```

**IMPORTANTE:** Use `http://openwa-api:2785` (hostname interno do Docker), **NÃO** `http://localhost:2785`.

## Informações da Sessão WhatsApp Ativa

```json
{
  "id": "ccc077d7-481c-4cbb-8997-ba6c2b1720fc",
  "name": "atendente-test1",
  "status": "ready",
  "phone": "13214885868",
  "pushName": "Home Comfort HQ"
}
```

**Endpoint para enviar mensagens:**
```
POST http://openwa-api:2785/api/sessions/ccc077d7-481c-4cbb-8997-ba6c2b1720fc/messages/send-text
```

## Webhook n8n Configurado

O webhook do n8n está registrado no OpenWA para receber mensagens:

```
http://n8n:5678/webhook/whatsapp-message
```

Mensagens recebidas no WhatsApp são automaticamente enviadas para este webhook.

## Prevenção de Problemas Futuros

### Backup de Credenciais

Documente as credenciais em local seguro:

```bash
# Backup da API key
docker exec openwa-openwa-api-1 cat /app/data/.api-key > openwa-api-key-backup.txt

# Verificar credenciais n8n (via UI ou export do workflow)
```

### Monitoramento

Verifique periodicamente se as credenciais estão válidas:

```bash
# Testar API OpenWA
curl -H "x-api-key: $(docker exec openwa-openwa-api-1 cat /app/data/.api-key)" \
  http://localhost:2785/api/health

# Verificar sessões ativas
curl -H "x-api-key: $(docker exec openwa-openwa-api-1 cat /app/data/.api-key)" \
  http://localhost:2785/api/sessions
```

### Logs para Diagnóstico

```bash
# Logs do OpenWA
docker logs openwa-openwa-api-1 --tail 100 -f

# Logs do n8n
docker logs n8n --tail 100 -f

# Logs do n8n worker
docker logs n8n-worker --tail 100 -f
```

## Referências

- [OpenWA API Documentation](http://localhost:2785/api/docs)
- [n8n Credentials Guide](https://docs.n8n.io/credentials/)
- Setup completo: `docs/22-n8n-integration.md`
- Guias de implementação: `docs/GUIDES.md`

---

**Status:** ✅ Problema identificado e solução documentada
**Data:** 2026-08-27
**Próximo passo:** Recriar credencial no n8n seguindo os passos acima
