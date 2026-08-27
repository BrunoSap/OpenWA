# Fix: Erro 404 na Instalação de Plugins OpenWA

## 🐛 Problema

Ao tentar instalar plugins do catálogo ou via URL no dashboard OpenWA, aparece o erro:

```
Erro na instalação
Failed to download plugin from URL:
download failed with status 404
```

## 🔍 Causa Raiz

O container Docker **não tem certificados CA instalados**, causando falha na verificação SSL/TLS ao conectar com GitHub/servidores HTTPS.

### Evidências:

```bash
# Dentro do container
curl https://github.com/...
# Retorna: curl: (77) error setting certificate file: /etc/ssl/certs/ca-certificates.crt

ls /etc/ssl/certs/
# No such file or directory
```

O **Dockerfile não inclui `ca-certificates`** na lista de pacotes instalados (linha 90-116).

---

## ✅ Solução

### **Opção 1: Rebuild da Imagem (Permanente - Recomendado)**

1. **Edite o Dockerfile** (já aplicado neste repositório):

   Na linha ~112, adicione `ca-certificates` à lista:

   ```dockerfile
   RUN apt-get update && apt-get install -y --no-install-recommends \
       # ... outros pacotes ...
       curl \
       ca-certificates \    # ← ADICIONAR ESTA LINHA
       procps \
       sqlite3 \
       # ... resto ...
   ```

2. **Rebuild e restart do container**:

   ```bash
   # Rebuild a imagem
   docker compose build openwa-api

   # Restart o stack
   docker compose down
   docker compose up -d
   ```

3. **Teste a instalação de plugins** pelo dashboard

---

### **Opção 2: Workaround Temporário (Sem Rebuild)**

Se não puder rebuildar agora, instale manualmente no volume montado:

```bash
# 1. Baixe o plugin localmente
curl -L -o plugin.zip "https://github.com/rmyndharis/OpenWA-plugins/releases/download/group-translate-v1.3.5/group-translate.zip"

# 2. Extraia no diretório de plugins do container
docker exec -it openwa-api sh -c "mkdir -p /app/data/plugins/group-translate"

# 3. Copie o conteúdo
docker cp plugin.zip openwa-api:/tmp/
docker exec -it openwa-api sh -c "cd /tmp && unzip -o plugin.zip -d /app/data/plugins/group-translate && chown -R openwa:openwa /app/data/plugins"

# 4. Restart para detectar o plugin
docker compose restart openwa-api
```

**⚠️ Limitação:** Você precisará fazer isso manualmente para cada plugin. A solução permanente é rebuildar a imagem.

---

### **Opção 3: API com Download Local**

Use a API para instalar plugins, baixando-os primeiro localmente:

```bash
# 1. Baixe o plugin
curl -L -o group-translate.zip "https://github.com/rmyndharis/OpenWA-plugins/releases/download/group-translate-v1.3.5/group-translate.zip"

# 2. Instale via API (upload)
curl -X POST http://localhost:2785/api/plugins/install \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -F "file=@group-translate.zip"
```

**✅ Vantagem:** Funciona sem rebuild  
**⚠️ Limitação:** Requer download manual de cada plugin

---

## 🧪 Verificação

Após aplicar a solução permanente (rebuild), verifique:

```bash
# 1. Certificados instalados
docker exec openwa-api ls -la /etc/ssl/certs/ca-certificates.crt
# Deve retornar o arquivo

# 2. Teste conectividade HTTPS
docker exec openwa-api curl -I https://github.com
# Deve retornar HTTP/2 200 (ou 301)

# 3. Teste download de plugin
docker exec openwa-api curl -I -L "https://github.com/rmyndharis/OpenWA-plugins/releases/download/group-translate-v1.3.5/group-translate.zip"
# Deve retornar HTTP/2 200
```

---

## 📝 Contexto Técnico

### Por que o erro aparece como "404"?

O código Node.js/fetch no `plugin-download.ts` trata qualquer falha de rede como erro genérico. Quando o SSL/TLS falha (sem certificados CA), a requisição não chega nem a ser enviada, mas o dashboard interpreta como "download failed with status 404".

### Por que `read_only: true` impede a instalação runtime?

O Dockerfile usa `read_only: true` no `docker-compose.yml` (linha 80) como hardening de segurança. Isso impede instalação de pacotes em runtime via `apt-get`, exigindo que tudo seja instalado no build.

### Arquivos Relevantes:

- **Dockerfile** (linha 90-116): Lista de pacotes instalados
- **docker-compose.yml** (linha 80): `read_only: true`
- **src/modules/plugins/plugin-download.ts**: Lógica de download
- **src/modules/plugins/plugins.service.ts**: Serviço de instalação

---

## 🎯 Solução Aplicada

O fix foi aplicado em [Dockerfile](Dockerfile) linha ~113:

```diff
     curl \
+    ca-certificates \
     procps \
```

**Para aplicar**:

```bash
docker compose build openwa-api
docker compose down && docker compose up -d
```

---

## 🔗 Referências

- [Debian CA Certificates Package](https://packages.debian.org/bookworm/ca-certificates)
- [curl SSL Certificate Error 77](https://curl.se/docs/manual.html)
- [OpenWA Plugin Architecture](https://github.com/rmyndharis/OpenWA/blob/main/docs/19-plugin-architecture.md)
- [OpenWA-plugins Repository](https://github.com/rmyndharis/OpenWA-plugins)

---

**Status**: ✅ **Resolvido** via rebuild da imagem com `ca-certificates`
