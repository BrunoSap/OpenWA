// === LIMPAR RESPOSTA ===
const llmOutput = $input.first().json;
let text = llmOutput.text || llmOutput.output || '';

console.log('[CLEAN] ===== INICIO =====');
console.log('[CLEAN] Raw LLM output length:', text.length);
console.log('[CLEAN] First 200 chars:', text.substring(0, 200));

const originalLength = text.length;

// REGEX AGRESSIVO: Remover TUDO antes do último </think>
if (text.includes('<think>')) {
  console.log('[CLEAN] Found <think> tag, removing...');
  
  // Estratégia 1: Remover tudo até o ÚLTIMO </think>
  const lastCloseTag = text.lastIndexOf('</think>');
  if (lastCloseTag !== -1) {
    console.log('[CLEAN] Strategy 1: Removing everything before last </think>');
    text = text.substring(lastCloseTag + 8); // 8 = length of '</think>'
  }
  
  // Estratégia 2: Se ainda tem <think>, regex global
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  
  // Estratégia 3: Trim agressivo
  text = text.trim().replace(/^\n+/, '');
  
  const cleanedLength = text.length;
  console.log('[CLEAN] Removed', originalLength - cleanedLength, 'chars');
}

// Limitar tamanho (WhatsApp limit)
if (text.length > 4000) {
  console.log('[CLEAN] Truncating to 4000 chars');
  text = text.substring(0, 3997) + '...';
}

// Fallback se vazio
if (!text || text.trim().length === 0) {
  console.error('[CLEAN] ERROR: Text is empty after cleaning!');
  text = 'Desculpa, tive um problema ao processar. Pode repetir?';
}

console.log('[CLEAN] Final text length:', text.length);
console.log('[CLEAN] Final text:', text);
console.log('[CLEAN] ===== FIM =====');

// Pegar dados do webhook
const webhookData = $('Webhook OpenWA').item.json.body;
const chatId = webhookData.data?.chatId;
const messageId = webhookData.data?.id;

return {
  json: {
    chatId: chatId,
    text: text,
    messageId: messageId
  }
};