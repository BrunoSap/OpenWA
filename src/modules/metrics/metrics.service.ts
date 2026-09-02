import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Gauge,
  register,
  collectDefaultMetrics,
} from 'prom-client';

// Interface para armazenar detalhes de requisições
export interface RequestDetail {
  id: string;
  timestamp: Date;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  ip?: string;
  body?: any;
  response?: any;
  error?: string;
}

// Interface para armazenar detalhes de mensagens WhatsApp
export interface MessageDetail {
  id: string;
  timestamp: Date;
  type: 'sent' | 'received' | 'failed';
  chatId: string;
  from: string;
  to: string;
  body: string;
  mediaType?: string;
  mediaUrl?: string;
  status?: string;
  error?: string;
  metadata?: Record<string, any>;
}

// Interface para armazenar detalhes de sessões
export interface SessionDetail {
  id: string;
  sessionId: string;
  status: 'active' | 'inactive' | 'connecting' | 'failed';
  startTime: Date;
  lastActivity?: Date;
  messageCount: number;
  errorCount: number;
  phoneNumber?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class MetricsService {
  // Métricas HTTP
  public readonly httpRequestsTotal: Counter;
  public readonly httpRequestDuration: Histogram;
  public readonly httpRequestsInFlight: Gauge;

  // Métricas WhatsApp
  public readonly whatsappMessagesTotal: Counter;
  public readonly whatsappActiveSessions: Gauge;
  public readonly whatsappMessageDuration: Histogram;
  public readonly whatsappErrors: Counter;

  // Stores para drill-down (últimos 1000 itens de cada)
  private requestStore: Map<string, RequestDetail> = new Map();
  private messageStore: Map<string, MessageDetail> = new Map();
  private sessionStore: Map<string, SessionDetail> = new Map();

  private readonly MAX_STORE_SIZE = 1000;

  constructor() {
    // Coletar métricas padrão do Node.js (CPU, memória, event loop)
    collectDefaultMetrics({ register });

    // ==========================================
    // MÉTRICAS HTTP
    // ==========================================
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total de requisições HTTP',
      labelNames: ['method', 'path', 'status'],
      registers: [register],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_milliseconds',
      help: 'Duração das requisições HTTP em milissegundos',
      labelNames: ['method', 'path', 'status'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
      registers: [register],
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Requisições HTTP em andamento',
      registers: [register],
    });

    // ==========================================
    // MÉTRICAS WHATSAPP
    // ==========================================
    this.whatsappMessagesTotal = new Counter({
      name: 'whatsapp_messages_total',
      help: 'Total de mensagens WhatsApp',
      labelNames: ['type', 'status'], // type: sent, received, failed | status: success, error
      registers: [register],
    });

    this.whatsappActiveSessions = new Gauge({
      name: 'whatsapp_active_sessions',
      help: 'Número de sessões WhatsApp ativas',
      registers: [register],
    });

    this.whatsappMessageDuration = new Histogram({
      name: 'whatsapp_message_duration_milliseconds',
      help: 'Tempo para enviar/processar mensagem WhatsApp',
      labelNames: ['type'],
      buckets: [100, 500, 1000, 2000, 5000, 10000],
      registers: [register],
    });

    this.whatsappErrors = new Counter({
      name: 'whatsapp_errors_total',
      help: 'Total de erros no WhatsApp',
      labelNames: ['type', 'error_code'],
      registers: [register],
    });
  }

  // ==========================================
  // MÉTODOS DE REGISTRO HTTP
  // ==========================================
  recordHttpRequest(detail: RequestDetail): void {
    // Incrementar contador
    this.httpRequestsTotal.inc({
      method: detail.method,
      path: this.normalizePath(detail.path),
      status: detail.statusCode.toString(),
    });

    // Registrar duração
    this.httpRequestDuration.observe(
      {
        method: detail.method,
        path: this.normalizePath(detail.path),
        status: detail.statusCode.toString(),
      },
      detail.duration,
    );

    // Armazenar para drill-down
    this.addToStore(this.requestStore, detail.id, detail);
  }

  startHttpRequest(): void {
    this.httpRequestsInFlight.inc();
  }

  endHttpRequest(): void {
    this.httpRequestsInFlight.dec();
  }

  // ==========================================
  // MÉTODOS DE REGISTRO WHATSAPP
  // ==========================================
  recordWhatsAppMessage(detail: MessageDetail): void {
    // Incrementar contador
    this.whatsappMessagesTotal.inc({
      type: detail.type,
      status: detail.error ? 'error' : 'success',
    });

    // Armazenar para drill-down
    this.addToStore(this.messageStore, detail.id, detail);
  }

  recordWhatsAppMessageDuration(type: string, durationMs: number): void {
    this.whatsappMessageDuration.observe({ type }, durationMs);
  }

  recordWhatsAppError(type: string, errorCode: string): void {
    this.whatsappErrors.inc({ type, error_code: errorCode });
  }

  updateActiveSessions(count: number): void {
    this.whatsappActiveSessions.set(count);
  }

  recordSession(detail: SessionDetail): void {
    this.addToStore(this.sessionStore, detail.id, detail);

    // Atualizar gauge de sessões ativas
    const activeSessions = Array.from(this.sessionStore.values()).filter(
      s => s.status === 'active',
    ).length;
    this.updateActiveSessions(activeSessions);
  }

  // ==========================================
  // MÉTODOS DE DRILL-DOWN
  // ==========================================
  getRequestDetails(id: string): RequestDetail | undefined {
    return this.requestStore.get(id);
  }

  getRecentRequests(limit: number = 100): RequestDetail[] {
    return Array.from(this.requestStore.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  searchRequests(filters: {
    method?: string;
    path?: string;
    statusCode?: number;
    minDuration?: number;
    maxDuration?: number;
    startTime?: Date;
    endTime?: Date;
  }): RequestDetail[] {
    let results = Array.from(this.requestStore.values());

    if (filters.method) {
      results = results.filter(r => r.method === filters.method);
    }
    if (filters.path) {
      results = results.filter(r => r.path.includes(filters.path!));
    }
    if (filters.statusCode) {
      results = results.filter(r => r.statusCode === filters.statusCode);
    }
    if (filters.minDuration) {
      results = results.filter(r => r.duration >= filters.minDuration!);
    }
    if (filters.maxDuration) {
      results = results.filter(r => r.duration <= filters.maxDuration!);
    }
    if (filters.startTime) {
      results = results.filter(r => r.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      results = results.filter(r => r.timestamp <= filters.endTime!);
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getMessageDetails(id: string): MessageDetail | undefined {
    return this.messageStore.get(id);
  }

  getRecentMessages(limit: number = 100): MessageDetail[] {
    return Array.from(this.messageStore.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  searchMessages(filters: {
    type?: 'sent' | 'received' | 'failed';
    chatId?: string;
    from?: string;
    to?: string;
    body?: string;
    startTime?: Date;
    endTime?: Date;
  }): MessageDetail[] {
    let results = Array.from(this.messageStore.values());

    if (filters.type) {
      results = results.filter(m => m.type === filters.type);
    }
    if (filters.chatId) {
      results = results.filter(m => m.chatId.includes(filters.chatId!));
    }
    if (filters.from) {
      results = results.filter(m => m.from.includes(filters.from!));
    }
    if (filters.to) {
      results = results.filter(m => m.to.includes(filters.to!));
    }
    if (filters.body) {
      results = results.filter(m => m.body.toLowerCase().includes(filters.body!.toLowerCase()));
    }
    if (filters.startTime) {
      results = results.filter(m => m.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      results = results.filter(m => m.timestamp <= filters.endTime!);
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getSessionDetails(id: string): SessionDetail | undefined {
    return this.sessionStore.get(id);
  }

  getActiveSessions(): SessionDetail[] {
    return Array.from(this.sessionStore.values())
      .filter(s => s.status === 'active')
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  getAllSessions(): SessionDetail[] {
    return Array.from(this.sessionStore.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  // ==========================================
  // MÉTRICAS PROMETHEUS
  // ==========================================
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  // ==========================================
  // MÉTODOS AUXILIARES
  // ==========================================
  private normalizePath(path: string): string {
    // Remove IDs, UUIDs, números para agrupar rotas
    return path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\?.*/g, ''); // Remove query strings
  }

  private addToStore<T>(store: Map<string, T>, key: string, value: T): void {
    // Se chegou no limite, remove o mais antigo
    if (store.size >= this.MAX_STORE_SIZE) {
      const firstKey = store.keys().next().value;
      if (firstKey !== undefined) {
        store.delete(firstKey);
      }
    }
    store.set(key, value);
  }

  // ==========================================
  // ESTATÍSTICAS
  // ==========================================
  getStats() {
    return {
      requests: {
        total: this.requestStore.size,
        recent: this.getRecentRequests(10).length,
      },
      messages: {
        total: this.messageStore.size,
        recent: this.getRecentMessages(10).length,
      },
      sessions: {
        total: this.sessionStore.size,
        active: this.getActiveSessions().length,
      },
    };
  }
}
