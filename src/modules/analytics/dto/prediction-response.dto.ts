export class PredictionResponseDto {
  conversationId!: string;

  prediction!: {
    willEscalate: boolean;
    probability: number;
    confidence: 'low' | 'medium' | 'high';
  };

  recommendation!: string;
}

export class VolumeForecastResponseDto {
  forecast!: Array<{
    hour: string;
    predicted_messages: number;
  }>;

  peak!: {
    hour: string;
    predicted_messages: number;
  };
}

export class AnomalyResponseDto {
  anomalies!: Array<{
    timestamp: string;
    metric: string;
    score: number;
    isAnomaly: boolean;
  }>;
}
