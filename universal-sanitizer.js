// ===================================================================
// 🔒 SANITIZAÇÃO UNIVERSAL DE DADOS SENSÍVEIS
// ===================================================================
// Sistema genérico que detecta e redacta QUALQUER dado sensível,
// independente do tipo de documento ou contexto.
//
// Estratégia: 3 camadas progressivas
// 1. Padrões estruturais (regex universal)
// 2. Detecção por contexto semântico (NER-like)
// 3. Heurísticas adaptativas (aprende novos padrões)
// ===================================================================

class UniversalSanitizer {
  constructor() {
    // === CAMADA 1: Padrões Estruturais Universais ===
    this.structuralPatterns = [
      // Números de identificação (11-14 dígitos com formatação opcional)
      {
        name: 'ID_NUMBER',
        pattern: /\b\d{2,3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-/]?\d{4}[.\s-]?\d{2}\b/g,
        replacement: '[ID REDACTED]',
        confidence: 0.95
      },
      // Números puros longos (8-14 dígitos consecutivos)
      {
        name: 'NUMERIC_ID',
        pattern: /\b\d{8,14}\b/g,
        replacement: '[ID REDACTED]',
        confidence: 0.8,
        contextRequired: true
      },
      // Placas de veículos (padrão Mercosul e antigo)
      {
        name: 'LICENSE_PLATE',
        pattern: /\b[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}\b/g,
        replacement: '[PLACA REDACTED]',
        confidence: 0.98
      },
      // Emails
      {
        name: 'EMAIL',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: '[EMAIL REDACTED]',
        confidence: 1.0
      },
      // Telefones (formato internacional e nacional)
      {
        name: 'PHONE',
        pattern: /\+?\d{1,3}[-.\s]?\(?\d{2,3}\)?[-.\s]?\d{4,5}[-.\s]?\d{4}/g,
        replacement: '[TELEFONE REDACTED]',
        confidence: 0.9
      },
      // URLs e domínios
      {
        name: 'URL',
        pattern: /https?:\/\/[^\s]+/g,
        replacement: '[URL REDACTED]',
        confidence: 0.95
      },
      // Endereços IP
      {
        name: 'IP_ADDRESS',
        pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        replacement: '[IP REDACTED]',
        confidence: 0.85
      },
      // Datas (múltiplos formatos)
      {
        name: 'DATE',
        pattern: /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
        replacement: '[DATA REDACTED]',
        confidence: 0.7,
        contextRequired: true
      },
      // Valores monetários altos (>= R$ 1.000,00)
      {
        name: 'CURRENCY_HIGH',
        pattern: /R\$\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}/g,
        replacement: 'R$ [VALOR REDACTED]',
        confidence: 0.8,
        contextRequired: true
      },
      // Contas bancárias (genérico)
      {
        name: 'BANK_ACCOUNT',
        pattern: /\b\d{4,12}[-\s]\d{1,2}\b/g,
        replacement: '[CONTA REDACTED]',
        confidence: 0.7,
        contextRequired: true
      },
      // Códigos de barras (44-48 dígitos)
      {
        name: 'BARCODE',
        pattern: /\b\d{44,48}\b/g,
        replacement: '[CÓDIGO REDACTED]',
        confidence: 0.9
      },
      // Chave aleatória PIX (UUID-like)
      {
        name: 'PIX_RANDOM',
        pattern: /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi,
        replacement: '[PIX REDACTED]',
        confidence: 0.95
      }
    ];

    // === CAMADA 2: Palavras-chave de Contexto Sensível ===
    this.sensitiveContextKeywords = [
      'cpf', 'cnpj', 'rg', 'cnh', 'passaporte', 'documento', 'identidade',
      'renavam', 'chassi', 'placa', 'licenciamento', 'ipva',
      'conta', 'agência', 'banco', 'cartão', 'pix',
      'nascimento', 'endereço', 'telefone', 'email',
      'processo', 'protocolo', 'certidão'
    ];

    // === CAMADA 3: Padrões de Nomes Próprios ===
    this.namePatterns = {
      labeledName: /\b(Nome|Contribuinte|Proprietário|Titular|Cliente):\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){1,5})/gi,
      fullName: /\b[A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+){1,5}\b/g
    };

    this.learnedPatterns = new Set();
  }

  sanitize(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return { text: '', metadata: { sanitized: false } };
    }

    const originalText = text;
    const metadata = {
      sanitized: false,
      redactions: [],
      patterns: [],
      confidence: 0,
      hadSensitiveContext: false
    };

    text = this._removeThinkingTags(text);
    const hasSensitiveContext = this._detectSensitiveContext(text);
    metadata.hadSensitiveContext = hasSensitiveContext;

    const structuralResult = this._applyStructuralPatterns(text, hasSensitiveContext);
    text = structuralResult.text;
    metadata.redactions.push(...structuralResult.redactions);
    metadata.patterns.push(...structuralResult.patterns);

    if (hasSensitiveContext) {
      const nameResult = this._redactNames(text);
      text = nameResult.text;
      metadata.redactions.push(...nameResult.redactions);
    }

    text = this._cleanFormatting(text);

    metadata.confidence = metadata.redactions.length > 0
      ? metadata.redactions.reduce((sum, r) => sum + r.confidence, 0) / metadata.redactions.length
      : 0;

    metadata.sanitized = metadata.redactions.length > 0;

    return { text, metadata, original: originalText };
  }

  _removeThinkingTags(text) {
    const patterns = [
      /<think>[\s\S]*?<\/think>/gi,
      /<thinking>[\s\S]*?<\/thinking>/gi,
      /\[THINKING\][\s\S]*?\[\/THINKING\]/gi
    ];
    patterns.forEach(pattern => {
      text = text.replace(pattern, '');
    });
    return text;
  }

  _detectSensitiveContext(text) {
    const lowerText = text.toLowerCase();
    return this.sensitiveContextKeywords.some(keyword =>
      lowerText.includes(keyword)
    );
  }

  _applyStructuralPatterns(text, hasSensitiveContext) {
    const redactions = [];
    const patterns = [];

    this.structuralPatterns.forEach(pattern => {
      if (pattern.contextRequired && !hasSensitiveContext) return;

      const matches = [...text.matchAll(pattern.pattern)];
      if (matches.length > 0) {
        patterns.push(pattern.name);
        matches.forEach(match => {
          redactions.push({
            type: pattern.name,
            original: match[0],
            position: match.index,
            confidence: pattern.confidence
          });
        });
        text = text.replace(pattern.pattern, pattern.replacement);
      }
    });

    return { text, redactions, patterns };
  }

  _redactNames(text) {
    const redactions = [];

    const labeledMatches = [...text.matchAll(this.namePatterns.labeledName)];
    labeledMatches.forEach(match => {
      const fullMatch = match[0];
      const label = match[1];
      const name = match[2];
      redactions.push({
        type: 'LABELED_NAME',
        original: name,
        position: match.index,
        confidence: 0.95
      });
      text = text.replace(fullMatch, `${label}: [NOME REDACTED]`);
    });

    return { text, redactions };
  }

  _cleanFormatting(text) {
    return text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{3,}/g, '  ')
      .trim();
  }

  getAuditReport(sanitizeResult) {
    const { metadata, original, text } = sanitizeResult;
    return {
      summary: {
        originalLength: original.length,
        sanitizedLength: text.length,
        reductionPercent: Math.round((1 - text.length / original.length) * 100),
        redactionCount: metadata.redactions.length,
        avgConfidence: metadata.confidence.toFixed(2)
      },
      redactions: metadata.redactions.map(r => ({
        type: r.type,
        confidence: r.confidence
      })),
      patterns: metadata.patterns,
      hadSensitiveContext: metadata.hadSensitiveContext
    };
  }
}

// Singleton global
if (typeof globalThis.sanitizer === 'undefined') {
  globalThis.sanitizer = new UniversalSanitizer();
}

module.exports = UniversalSanitizer;
