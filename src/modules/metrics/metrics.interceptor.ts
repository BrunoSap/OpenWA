import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const requestId = uuidv4();
    const startTime = Date.now();

    // Marcar início da requisição
    this.metricsService.startHttpRequest();

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          const duration = Date.now() - startTime;

          // Registrar requisição com sucesso
          this.metricsService.recordHttpRequest({
            id: requestId,
            timestamp: new Date(startTime),
            method: request.method,
            path: request.url,
            statusCode: response.statusCode,
            duration,
            userAgent: request.headers['user-agent'],
            ip: request.ip || request.connection.remoteAddress,
            body: this.sanitizeBody(request.body),
            response: this.sanitizeResponse(responseBody),
          });

          this.metricsService.endHttpRequest();
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          // Registrar requisição com erro
          this.metricsService.recordHttpRequest({
            id: requestId,
            timestamp: new Date(startTime),
            method: request.method,
            path: request.url,
            statusCode,
            duration,
            userAgent: request.headers['user-agent'],
            ip: request.ip || request.connection.remoteAddress,
            body: this.sanitizeBody(request.body),
            error: error.message || 'Unknown error',
          });

          this.metricsService.endHttpRequest();
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return undefined;

    // Limitar tamanho do body para não explodir a memória
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 10000) {
      return { _truncated: true, _size: bodyStr.length };
    }

    // Remover campos sensíveis
    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private sanitizeResponse(response: any): any {
    if (!response) return undefined;

    // Limitar tamanho da resposta
    const responseStr = JSON.stringify(response);
    if (responseStr.length > 10000) {
      return { _truncated: true, _size: responseStr.length };
    }

    return response;
  }
}
