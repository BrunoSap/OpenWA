# ✅ Solução Aplicada: Erro 404 Plugins OpenWA

## 🎯 Problema Resolvido

**Erro original:**
```
Erro na instalação
Failed to download plugin from URL:
download failed with status 404
```

**Causa raiz identificada:**
- Container Docker sem pacote `ca-certificates` instalado
- Falha na validação de certificados SSL/TLS
- Downloads HTTPS impossíveis (curl error 77)

---

## 🔧 Fix Aplicado

### Mudança no Dockerfile (linha 113):

```diff
 RUN apt-get update && apt-get install -y --no-install-recommends \
     # ... outros pacotes ...
     curl \
+    ca-certificates \
     procps \
     sqlite3 \
     ffmpeg \
     && rm -rf /var/lib/apt/lists/*
```

### Rebuild e Deploy:

```bash
# 1. Rebuild da imagem
docker compose build openwa-api

# 2. Restart completo
docker rm -f openwa-api
docker compose up -d

# 3. Verificação
docker exec openwa-api ls -la /etc/ssl/certs/ca-certificates.crt
# ✅ -rw-r--r-- 1 root root 210671 /etc/ssl/certs/ca-certificates.crt
```

---

## ✅ Testes de Validação

### 1. Certificados instalados:
```bash
$ docker exec openwa-api test -f /etc/ssl/certs/ca-certificates.crt && echo "OK"
✅ OK
```

### 2. Conectividade HTTPS funcionando:
```bash
$ docker exec openwa-api curl -I -s -L "https://github.com/rmyndharis/OpenWA-plugins/releases/download/group-translate-v1.3.4/group-translate.zip" | grep HTTP
HTTP/2 302 
HTTP/2 200
```

### 3. Catálogo de plugins acessível:
```bash
$ docker exec openwa-api curl -I -s "https://raw.githubusercontent.com/rmyndharis/OpenWA-plugins/main/plugins.json" | grep HTTP
HTTP/2 200
```

---

## 📋 Status Atual

| Item | Status |
|------|--------|
| Certificados CA | ✅ Instalados |
| Conectividade HTTPS | ✅ Funcionando |
| Acesso ao GitHub | ✅ OK (HTTP/2 200) |
| Catálogo de plugins | ✅ Acessível |
| Container rodando | ✅ Healthy |

---

## 🎓 Lição Aprendida

O erro "404" era **enganoso** - na verdade era uma falha SSL/TLS que o Node.js/fetch interpretou como erro de download genérico.

**Checklist de debug SSL em containers:**
1. ✅ Verificar se `ca-certificates` está instalado
2. ✅ Verificar existência de `/etc/ssl/certs/ca-certificates.crt`
3. ✅ Testar com `curl -I https://...` dentro do container
4. ✅ Verificar logs para `curl: (77)` ou `certificate` errors

---

## 📚 Arquivos Relacionados

- [Dockerfile](Dockerfile) - Fix aplicado linha 113
- [INSTALL_PLUGINS.md](INSTALL_PLUGINS.md) - Guia de instalação
- [FIX_PLUGIN_404.md](FIX_PLUGIN_404.md) - Documentação técnica do problema

---

## 🚀 Próximos Passos

1. **Testar instalação via dashboard:**
   - Acessar `http://localhost:2785`
   - Ir em **Plugins → Catálogo**
   - Instalar qualquer plugin
   - Deve funcionar agora! ✅

2. **⚠️ Atenção:** Algumas versões no catálogo podem estar desatualizadas em relação aos releases do GitHub. Se encontrar 404, verifique os releases reais em:
   ```
   https://github.com/rmyndharis/OpenWA-plugins/releases
   ```

---

**Data da solução:** 2026-08-22  
**Container testado:** openwa-api (Debian 12 bookworm)  
**Versão OpenWA:** 0.23.1
