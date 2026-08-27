import { Test, TestingModule } from '@nestjs/testing';
import { PredictionsController } from './predictions.controller';
import { PredictiveModelsService } from '../services/predictive-models.service';

describe('PredictionsController', () => {
  let controller: PredictionsController;
  let service: PredictiveModelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PredictionsController],
      providers: [
        {
          provide: PredictiveModelsService,
          useValue: {
            predictOutcome: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PredictionsController>(PredictionsController);
    service = module.get<PredictiveModelsService>(PredictiveModelsService);
  });

  describe('predictOutcome', () => {
    it('should return prediction with confidence level', async () => {
      // Arrange
      const mockPrediction = {
        willEscalate: true,
        probability: 0.78,
        confidence: 'high' as const,
        recommendation: 'Consider proactive human handoff',
      };
      jest.spyOn(service, 'predictOutcome').mockResolvedValue(mockPrediction);

      // Act
      const result = await controller.predictOutcome({
        conversationId: 'test-conv-123',
      });

      // Assert
      expect(result.conversationId).toBe('test-conv-123');
      expect(result.prediction.willEscalate).toBe(true);
      expect(result.prediction.probability).toBe(0.78);
      expect(result.prediction.confidence).toBe('high');
      expect(result.recommendation).toBe('Consider proactive human handoff');
    });

    it('should return low confidence for probability 0.40-0.60', async () => {
      // Arrange
      const mockPrediction = {
        willEscalate: false,
        probability: 0.45,
        confidence: 'low' as const,
        recommendation: 'Continue monitoring',
      };
      jest.spyOn(service, 'predictOutcome').mockResolvedValue(mockPrediction);

      // Act
      const result = await controller.predictOutcome({
        conversationId: 'test-conv-456',
      });

      // Assert
      expect(result.prediction.confidence).toBe('low');
      expect(result.prediction.probability).toBe(0.45);
    });
  });

  describe('predictVolume', () => {
    it('should return 24h forecast with peak hour', async () => {
      // Act
      const result = await controller.predictVolume();

      // Assert
      expect(result.forecast).toBeDefined();
      expect(result.forecast.length).toBe(24);
      expect(result.peak).toBeDefined();
      expect(result.peak.hour).toBeDefined();
      expect(result.peak.predicted_messages).toBeGreaterThan(0);

      // Verify peak is actually the max
      const maxInForecast = Math.max(
        ...result.forecast.map((f) => f.predicted_messages),
      );
      expect(result.peak.predicted_messages).toBe(maxInForecast);
    });
  });

  describe('getAnomalies', () => {
    it('should return anomalies with scores and timestamps', async () => {
      // Act
      const result = await controller.getAnomalies('24');

      // Assert
      expect(result.anomalies).toBeDefined();
      expect(Array.isArray(result.anomalies)).toBe(true);

      if (result.anomalies.length > 0) {
        const anomaly = result.anomalies[0];
        expect(anomaly.timestamp).toBeDefined();
        expect(anomaly.metric).toBeDefined();
        expect(anomaly.score).toBeDefined();
        expect(typeof anomaly.isAnomaly).toBe('boolean');
      }
    });
  });
});
