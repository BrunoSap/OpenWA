import { Controller, Get, Query, Param, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { MetricsService } from './metrics.service';
import { Public } from '../auth/decorators/auth.decorators';

@Controller('api/metrics')
@Public()
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  // ==========================================
  // ENDPOINT PROMETHEUS
  // ==========================================
  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }

  // ==========================================
  // DRILL-DOWN: HTTP REQUESTS
  // ==========================================
  @Get('requests')
  getRequests(
    @Query('limit') limit?: string,
    @Query('method') method?: string,
    @Query('path') path?: string,
    @Query('status') statusCode?: string,
    @Query('minDuration') minDuration?: string,
    @Query('maxDuration') maxDuration?: string,
  ) {
    if (method || path || statusCode || minDuration || maxDuration) {
      return this.metricsService.searchRequests({
        method,
        path,
        statusCode: statusCode ? parseInt(statusCode) : undefined,
        minDuration: minDuration ? parseInt(minDuration) : undefined,
        maxDuration: maxDuration ? parseInt(maxDuration) : undefined,
      });
    }

    return this.metricsService.getRecentRequests(
      limit ? parseInt(limit) : 100,
    );
  }

  @Get('requests/:id')
  getRequestDetails(@Param('id') id: string) {
    const request = this.metricsService.getRequestDetails(id);
    if (!request) {
      return { error: 'Request not found' };
    }
    return request;
  }

  // ==========================================
  // DRILL-DOWN: WHATSAPP MESSAGES
  // ==========================================
  @Get('messages')
  getMessages(
    @Query('limit') limit?: string,
    @Query('type') type?: 'sent' | 'received' | 'failed',
    @Query('chatId') chatId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('body') body?: string,
  ) {
    if (type || chatId || from || to || body) {
      return this.metricsService.searchMessages({
        type,
        chatId,
        from,
        to,
        body,
      });
    }

    return this.metricsService.getRecentMessages(
      limit ? parseInt(limit) : 100,
    );
  }

  @Get('messages/:id')
  getMessageDetails(@Param('id') id: string) {
    const message = this.metricsService.getMessageDetails(id);
    if (!message) {
      return { error: 'Message not found' };
    }
    return message;
  }

  // ==========================================
  // DRILL-DOWN: SESSIONS
  // ==========================================
  @Get('sessions')
  getSessions(@Query('status') status?: string) {
    if (status === 'active') {
      return this.metricsService.getActiveSessions();
    }
    return this.metricsService.getAllSessions();
  }

  @Get('sessions/:id')
  getSessionDetails(@Param('id') id: string) {
    const session = this.metricsService.getSessionDetails(id);
    if (!session) {
      return { error: 'Session not found' };
    }
    return session;
  }

  // ==========================================
  // ESTATÍSTICAS GERAIS
  // ==========================================
  @Get('stats')
  getStats() {
    return this.metricsService.getStats();
  }
}
