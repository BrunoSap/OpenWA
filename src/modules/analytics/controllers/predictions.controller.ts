import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { RequireRole } from '../../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../../auth/entities/api-key.entity';
import { PredictiveModelsService } from '../services/predictive-models.service';
import { PredictionRequestDto } from '../dto/prediction-request.dto';
import {
  PredictionResponseDto,
  VolumeForecastResponseDto,
  AnomalyResponseDto,
} from '../dto/prediction-response.dto';

@Controller('analytics/predict')
@RequireRole(ApiKeyRole.OPERATOR)
export class PredictionsController {
  constructor(
    private readonly predictiveModelsService: PredictiveModelsService,
  ) {}

  @Post('outcome')
  async predictOutcome(
    @Body() dto: PredictionRequestDto,
  ): Promise<PredictionResponseDto> {
    const result = await this.predictiveModelsService.predictOutcome(
      dto.conversationId,
    );

    return {
      conversationId: dto.conversationId,
      prediction: {
        willEscalate: result.willEscalate,
        probability: result.probability,
        confidence: result.confidence,
      },
      recommendation: result.recommendation,
    };
  }

  @Get('volume')
  async predictVolume(): Promise<VolumeForecastResponseDto> {
    // LSTM implementation in progress - return mock forecast for now
    const now = new Date();
    const forecast = [];
    let maxMessages = 0;
    let peakHour = '';

    for (let i = 0; i < 24; i++) {
      const hour = new Date(now.getTime() + i * 60 * 60 * 1000);
      const predicted = Math.floor(30 + Math.random() * 90); // Mock: 30-120 messages

      if (predicted > maxMessages) {
        maxMessages = predicted;
        peakHour = hour.toISOString();
      }

      forecast.push({
        hour: hour.toISOString(),
        predicted_messages: predicted,
      });
    }

    return {
      forecast,
      peak: {
        hour: peakHour,
        predicted_messages: maxMessages,
      },
    };
  }

  @Get('anomalies')
  async getAnomalies(
    @Query('hours') hours: string = '24',
  ): Promise<AnomalyResponseDto> {
    // Query recent analytics_events and compute hourly aggregates
    // Then run anomaly detection on each aggregate
    const hoursToCheck = parseInt(hours, 10) || 24;
    const anomalies = [];

    // Mock implementation - real implementation would:
    // 1. Query analytics_events for last N hours
    // 2. Compute hourly aggregates (fallback_rate, avg_latency, etc.)
    // 3. Run detectAnomaly() on each aggregate
    // 4. Return only anomalies (isAnomaly=true)

    const now = new Date();
    for (let i = 0; i < hoursToCheck; i++) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
      const fallbackRate = Math.random() * 0.3; // 0-30%

      // Simulate anomaly detection (score > threshold 0.05)
      const score = Math.random() * 0.1;
      const isAnomaly = score > 0.05;

      if (isAnomaly || i === 0) {
        // Include at least one for demo
        anomalies.push({
          timestamp: timestamp.toISOString(),
          metric: 'fallback_rate',
          score: parseFloat(score.toFixed(4)),
          isAnomaly,
        });
      }
    }

    return { anomalies };
  }
}
