# 🔑 Guia de Login - OpenWA

## 📋 Suas Chaves API Válidas

### **Nova Chave (criada no último restart):**
```
owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc
```

### **Chave Antiga (ainda válida):**
```
owa_k1_ba7ecea417378f14f83606dea758cc47d10f1adcfd0373bdbd44c4e3d704d0b8
```

---

## 🌐 Como Acessar o Dashboard

### **Opção 1: Acesso Direto (Sem Autenticação)**

O dashboard OpenWA **não requer autenticação via navegador** por padrão. A chave API é usada apenas para chamadas à API REST.

1. **Abra seu navegador**
2. **Acesse:** `http://localhost:2785`
3. **Pronto!** O dashboard deve carregar diretamente

Se o dashboard não carregar, veja a seção de troubleshooting abaixo.

---

## 🔧 Como Usar a Chave API

A chave API é necessária **apenas** para:

### **1. Chamadas REST via curl/Postman/código:**

```bash
# Exemplo: Listar sessões
curl -X GET http://localhost:2785/api/sessions \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"

# Exemplo: Health check
curl -X GET http://localhost:2785/api/health \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"

# Exemplo: Listar plugins
curl -X GET http://localhost:2785/api/plugins \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"
```

### **2. SDKs e Integrações:**

```javascript
// Node.js
const client = new OpenWAClient({
  apiKey: 'owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc',
  baseUrl: 'http://localhost:2785'
});

// Python
client = OpenWAClient(
    api_key='owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc',
    base_url='http://localhost:2785'
)
```

---

## 🚨 Troubleshooting

### **Problema 1: Dashboard não carrega (página em branco)**

**Causa:** CSP (Content Security Policy) está forçando HTTPS

**Solução:**

1. Adicione ao seu `.env`:
   ```bash
   CSP_UPGRADE_INSECURE_REQUESTS=false
   ```

2. Reinicie o container:
   ```bash
   docker compose restart openwa-api
   ```

3. Acesse novamente: `http://localhost:2785`

---

### **Problema 2: API retorna 401 Unauthorized**

**Causa:** Chave API inválida ou revogada

**Soluções:**

#### **A. Use a chave mais recente:**
```
owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc
```

#### **B. Crie uma nova chave via dashboard:**
1. Acesse `http://localhost:2785`
2. Vá em **Settings → API Keys**
3. Clique em **Create New Key**
4. Copie a nova chave

#### **C. Recupere a chave atual:**
```bash
docker exec openwa-api cat /app/data/.api-key
```

---

### **Problema 3: "x-api-key header required"**

**Causa:** Endpoint protegido requer autenticação

**Solução:** Sempre adicione o header:
```bash
-H "x-api-key: SUA_CHAVE_AQUI"
```

---

### **Problema 4: Esqueci todas as chaves**

**Solução 1 - Recuperar do container:**
```bash
# Chave de bootstrap
docker exec openwa-api cat /app/data/.api-key

# Ver chave nos logs
docker logs openwa-api 2>&1 | grep "owa_k1_"
```

**Solução 2 - Gerar nova chave master:**
```bash
# Parar container
docker compose stop openwa-api

# Remover arquivo de chave
docker exec openwa-api rm /app/data/.api-key 2>/dev/null || true

# Reiniciar (cria nova chave)
docker compose up -d openwa-api

# Recuperar nova chave
docker logs openwa-api 2>&1 | grep "API Key (newly created)" -A 1
```

---

## 🔐 Gerenciamento de Chaves

### **Ver todas as chaves:**
```bash
curl -X GET http://localhost:2785/api/auth/api-keys \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc" \
  | jq .
```

### **Criar nova chave:**
```bash
curl -X POST http://localhost:2785/api/auth/api-keys \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Minha Nova Chave",
    "role": "ADMIN"
  }'
```

### **Revogar chave:**
```bash
curl -X POST http://localhost:2785/api/auth/api-keys/{ID}/revoke \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"
```

---

## 📱 Tipos de Roles (Permissões)

| Role | Permissões | Uso Recomendado |
|------|-----------|-----------------|
| **ADMIN** | Acesso total (sessões, plugins, configurações) | Administração do sistema |
| **OPERATOR** | Gerenciar sessões e mensagens | Operação do dia-a-dia |
| **READONLY** | Apenas leitura | Monitoramento, dashboards externos |

---

## 🎯 Quick Start

### **1. Acesso ao Dashboard:**
```
http://localhost:2785
```

### **2. Primeira chamada à API:**
```bash
curl http://localhost:2785/api/health \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc"
```

### **3. Criar uma sessão WhatsApp:**
```bash
curl -X POST http://localhost:2785/api/sessions \
  -H "x-api-key: owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "meu-whatsapp"}'
```

---

## 📖 Documentação Adicional

- **API Reference:** `http://localhost:2785/api/docs` (Swagger/OpenAPI)
- **Documentação Oficial:** [GitHub - rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA)
- **Guia de Plugins:** [INSTALL_PLUGINS.md](INSTALL_PLUGINS.md)

---

## ⚠️ Segurança

### **Boas Práticas:**

1. ✅ **Nunca commit chaves no Git**
2. ✅ **Use role READONLY** para integrações externas
3. ✅ **Revogue chaves** não utilizadas
4. ✅ **Rotacione chaves** periodicamente
5. ✅ **Use HTTPS** em produção

### **Variáveis de Ambiente Seguras:**

Adicione ao `.env`:
```bash
# Master key (mais seguro que bootstrap file)
API_MASTER_KEY=sua-chave-super-secreta-aqui

# Pepper para hashing de chaves
API_KEY_PEPPER=outro-segredo-aleatório
```

---

**Status:** ✅ OpenWA rodando em `http://localhost:2785`  
**Chave Atual:** `owa_k1_038fe7c625b624ebb3fbb56aeb6cfeb35b87389bfceee07c3e0cb94e57f5fadc`
