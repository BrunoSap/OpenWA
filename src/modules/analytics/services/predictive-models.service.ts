import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MLModelVersion } from '../entities/ml-model-version.entity';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs';
import * as path from 'path';

interface ConversationFeatures {
  message_count: number;
  avg_latency_ms: number;
  fallback_count: number;
  llm_calls_count: number;
  sentiment_score: number;
  hour_of_day: number;
  day_of_week: number;
  user_message_length_avg: number;
  time_since_last_message: number;
}

interface TrainingResult {
  accuracy: number;
  loss: number;
  valAccuracy: number;
  valLoss: number;
  trainingDurationMs: number;
  datasetSize: number;
}

interface PredictionResponse {
  willEscalate: boolean;
  probability: number;
  confidence: 'low' | 'medium' | 'high';
  recommendation: string;
}

@Injectable()
export class PredictiveModelsService {
  private readonly logger = new Logger(PredictiveModelsService.name);
  private readonly mlModelsDir: string;

  constructor(
    @InjectRepository(MLModelVersion, 'data')
    private readonly mlModelVersionRepo: Repository<MLModelVersion>,
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly analyticsEventRepo: Repository<AnalyticsEvent>,
  ) {
    this.mlModelsDir = process.env.ML_MODELS_DIR || './ml-models';
    // Ensure ML models directory exists
    if (!fs.existsSync(this.mlModelsDir)) {
      fs.mkdirSync(this.mlModelsDir, { recursive: true });
    }
  }

  /**
   * Extract 9 features from conversation events for ML model input
   */
  async extractConversationFeatures(
    conversationId: string,
  ): Promise<ConversationFeatures> {
    const events = await this.analyticsEventRepo.find({
      where: { conversation_id: conversationId },
      order: { created_at: 'ASC' },
    });

    if (events.length === 0) {
      throw new Error(`No events found for conversation ${conversationId}`);
    }

    // Extract features
    const messageEvents = events.filter(
      (e) => e.event_type === 'message.processed',
    );
    const fallbackEvents = events.filter(
      (e) => e.event_type === 'fallback.triggered',
    );
    const llmEvents = events.filter((e) => e.event_type === 'llm.called');

    const latencies = messageEvents
      .map((e) => e.latency_ms)
      .filter((l) => l != null);
    const avgLatency = latencies.length > 0
      ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
      : 0;

    const messageLengths = messageEvents
      .map((e) => e.payload?.user_message_length || e.payload?.message_text?.length || 0)
      .filter((l) => l > 0);
    const avgMessageLength = messageLengths.length > 0
      ? messageLengths.reduce((sum, l) => sum + l, 0) / messageLengths.length
      : 0;

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    const timeSinceLastMessage = lastEvent.created_at
      ? Math.floor(
          (new Date().getTime() - new Date(lastEvent.created_at).getTime()) /
            1000,
        )
      : 0;

    const firstTimestamp = new Date(firstEvent.created_at);
    const hourOfDay = firstTimestamp.getUTCHours();
    const dayOfWeek = firstTimestamp.getUTCDay();

    return {
      message_count: messageEvents.length,
      avg_latency_ms: avgLatency,
      fallback_count: fallbackEvents.length,
      llm_calls_count: llmEvents.length,
      sentiment_score: 0, // Placeholder for now (requires sentiment analysis integration)
      hour_of_day: hourOfDay,
      day_of_week: dayOfWeek,
      user_message_length_avg: avgMessageLength,
      time_since_last_message: timeSinceLastMessage,
    };
  }

  /**
   * Build outcome prediction model architecture per RESEARCH.md L715-732
   */
  buildOutcomePredictionModel(): tf.Sequential {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [9], units: 16, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 8, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'sigmoid' }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  /**
   * Train outcome prediction model on last 30 days of conversation data
   */
  async trainOutcomeModel(): Promise<TrainingResult> {
    const startTime = Date.now();
    this.logger.log('Starting outcome model training...');

    // Fetch training data from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trainingData = await this.fetchTrainingData(thirtyDaysAgo);

    if (trainingData.length < 10) {
      throw new Error(
        `Insufficient training data: ${trainingData.length} samples (minimum 10 required)`,
      );
    }

    // Limit to 10,000 conversations per threat T-10-17
    const limitedData = trainingData.slice(0, 10000);
    this.logger.log(`Training on ${limitedData.length} conversations`);

    // Prepare tensors
    const features = tf.tensor2d(
      limitedData.map((d) => [
        d.message_count,
        d.avg_latency_ms,
        d.fallback_count,
        d.llm_calls_count,
        d.sentiment_score,
        d.hour_of_day,
        d.day_of_week,
        d.user_message_length_avg,
        d.time_since_last_message,
      ]),
    );
    const labels = tf.tensor2d(limitedData.map((d) => [d.label_escalated]));

    // Build and train model
    const model = this.buildOutcomePredictionModel();

    const history = await model.fit(features, labels, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0 || epoch === 49) {
            this.logger.log(
              `Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, acc=${logs.acc.toFixed(4)}, val_acc=${logs.val_acc.toFixed(4)}`,
            );
          }
        },
      },
    });

    const valAccuracy = history.history.val_acc[history.history.val_acc.length - 1] as number;
    const accuracy = history.history.acc[history.history.acc.length - 1] as number;
    const loss = history.history.loss[history.history.loss.length - 1] as number;
    const valLoss = history.history.val_loss[history.history.val_loss.length - 1] as number;

    this.logger.log(
      `Training complete: val_accuracy=${valAccuracy.toFixed(4)}`,
    );

    // Save model if validation accuracy >= 70%
    if (valAccuracy >= 0.70) {
      const modelPath = path.join(this.mlModelsDir, 'outcome-model');
      if (!fs.existsSync(modelPath)) {
        fs.mkdirSync(modelPath, { recursive: true });
      }
      await model.save(`file://${modelPath}`);
      this.logger.log(`Model saved to ${modelPath}`);

      // Save metadata to database
      await this.saveModelVersion('outcome-model', {
        accuracy: valAccuracy,
        datasetSize: limitedData.length,
        trainingDurationMs: Date.now() - startTime,
        epochs: 50,
        loss: loss,
        valLoss: valLoss,
      });
    } else {
      this.logger.warn(
        `Model not saved: validation accuracy ${valAccuracy.toFixed(4)} < 0.70`,
      );
    }

    // Cleanup tensors
    features.dispose();
    labels.dispose();
    model.dispose();

    return {
      accuracy,
      loss,
      valAccuracy,
      valLoss,
      trainingDurationMs: Date.now() - startTime,
      datasetSize: limitedData.length,
    };
  }

  /**
   * Fetch training data from analytics_events
   */
  private async fetchTrainingData(sinceDate: Date): Promise<any[]> {
    // Query to aggregate conversation features
    const query = this.analyticsEventRepo
      .createQueryBuilder('e')
      .select('e.conversation_id', 'conversation_id')
      .addSelect(
        `COUNT(CASE WHEN e.event_type = 'message.processed' THEN 1 END)`,
        'message_count',
      )
      .addSelect(
        `AVG(CASE WHEN e.latency_ms IS NOT NULL THEN e.latency_ms END)`,
        'avg_latency_ms',
      )
      .addSelect(
        `COUNT(CASE WHEN e.event_type = 'fallback.triggered' THEN 1 END)`,
        'fallback_count',
      )
      .addSelect(
        `COUNT(CASE WHEN e.event_type = 'llm.called' THEN 1 END)`,
        'llm_calls_count',
      )
      .addSelect('0', 'sentiment_score') // Placeholder
      .addSelect(
        `EXTRACT(HOUR FROM MIN(e.created_at))`,
        'hour_of_day',
      )
      .addSelect(
        `EXTRACT(DOW FROM MIN(e.created_at))`,
        'day_of_week',
      )
      .addSelect(
        `AVG(CASE WHEN e.payload->>'user_message_length' IS NOT NULL THEN CAST(e.payload->>'user_message_length' AS FLOAT) END)`,
        'user_message_length_avg',
      )
      .addSelect(
        `EXTRACT(EPOCH FROM (MAX(e.created_at) - MIN(e.created_at)))`,
        'time_since_last_message',
      )
      .addSelect(
        `CASE WHEN EXISTS (
          SELECT 1 FROM analytics_events ae
          WHERE ae.conversation_id = e.conversation_id
            AND ae.event_type = 'conversation.escalated'
        ) THEN 1 ELSE 0 END`,
        'label_escalated',
      )
      .where('e.created_at >= :sinceDate', { sinceDate })
      .andWhere('e.conversation_id IS NOT NULL')
      .groupBy('e.conversation_id');

    const results = await query.getRawMany();

    // Normalize values and handle nulls
    return results.map((r) => ({
      conversation_id: r.conversation_id,
      message_count: Number(r.message_count) || 0,
      avg_latency_ms: Number(r.avg_latency_ms) || 0,
      fallback_count: Number(r.fallback_count) || 0,
      llm_calls_count: Number(r.llm_calls_count) || 0,
      sentiment_score: Number(r.sentiment_score) || 0,
      hour_of_day: Number(r.hour_of_day) || 0,
      day_of_week: Number(r.day_of_week) || 0,
      user_message_length_avg: Number(r.user_message_length_avg) || 0,
      time_since_last_message: Number(r.time_since_last_message) || 0,
      label_escalated: Number(r.label_escalated) || 0,
    }));
  }

  /**
   * Save model version metadata to database
   */
  private async saveModelVersion(
    modelName: string,
    metadata: {
      accuracy: number;
      datasetSize: number;
      trainingDurationMs: number;
      epochs: number;
      loss: number;
      valLoss: number;
    },
  ): Promise<void> {
    // Set all previous versions to inactive
    await this.mlModelVersionRepo
      .createQueryBuilder()
      .update(MLModelVersion)
      .set({ active: false })
      .where('model_name = :modelName', { modelName })
      .execute();

    // Get last version and increment
    const lastVersion = await this.mlModelVersionRepo.findOne({
      where: { model_name: modelName },
      order: { created_at: 'DESC' },
    });

    const version = lastVersion
      ? this.incrementVersion(lastVersion.version)
      : 'v1.0.0';

    // Create new version
    const modelVersion = this.mlModelVersionRepo.create({
      model_name: modelName,
      version,
      training_date: new Date(),
      dataset_size: metadata.datasetSize,
      accuracy: metadata.accuracy,
      metadata: {
        training_duration_ms: metadata.trainingDurationMs,
        epochs: metadata.epochs,
        loss: metadata.loss,
        val_loss: metadata.valLoss,
      },
      active: true,
    });

    await this.mlModelVersionRepo.save(modelVersion);
    this.logger.log(`Saved model version ${version} for ${modelName}`);
  }

  /**
   * Increment semantic version
   */
  private incrementVersion(version: string): string {
    const match = version.match(/^v(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return 'v1.0.0';

    const [, major, minor, patch] = match;
    return `v${major}.${Number(minor) + 1}.0`;
  }

  /**
   * Predict conversation outcome (inference)
   */
  async predictOutcome(conversationId: string): Promise<PredictionResponse> {
    // Load trained model
    const modelPath = path.join(this.mlModelsDir, 'outcome-model', 'model.json');
    if (!fs.existsSync(modelPath)) {
      throw new Error('Outcome model not found. Please train the model first.');
    }

    const model = await tf.loadLayersModel(`file://${modelPath}`);

    // Extract features
    const features = await this.extractConversationFeatures(conversationId);
    const featureArray = [
      features.message_count,
      features.avg_latency_ms,
      features.fallback_count,
      features.llm_calls_count,
      features.sentiment_score,
      features.hour_of_day,
      features.day_of_week,
      features.user_message_length_avg,
      features.time_since_last_message,
    ];

    // Run inference
    const input = tf.tensor2d([featureArray]);
    const prediction = model.predict(input) as tf.Tensor;
    const probability = (await prediction.data())[0];

    // Compute confidence level
    const willEscalate = probability > 0.5;
    let confidence: 'low' | 'medium' | 'high';
    if (probability > 0.8 || probability < 0.2) {
      confidence = 'high';
    } else if (
      (probability >= 0.6 && probability <= 0.8) ||
      (probability >= 0.2 && probability <= 0.4)
    ) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Generate recommendation
    const recommendation =
      willEscalate && probability > 0.75
        ? 'Consider proactive human handoff'
        : 'Continue monitoring';

    // Cleanup
    input.dispose();
    prediction.dispose();
    model.dispose();

    return {
      willEscalate,
      probability,
      confidence,
      recommendation,
    };
  }

  /**
   * Build volume forecast LSTM model (foundation)
   */
  buildVolumeForecastModel(): tf.Sequential {
    return tf.sequential({
      layers: [
        tf.layers.lstm({ inputShape: [24, 1], units: 50, returnSequences: true }),
        tf.layers.lstm({ units: 50 }),
        tf.layers.dense({ units: 24, activation: 'relu' }),
      ],
    });
  }

  /**
   * Build anomaly detection autoencoder model (foundation)
   */
  buildAnomalyDetectionModel(): tf.Sequential {
    return tf.sequential({
      layers: [
        // Encoder
        tf.layers.dense({ inputShape: [10], units: 8, activation: 'relu' }),
        tf.layers.dense({ units: 4, activation: 'relu' }),
        // Decoder
        tf.layers.dense({ units: 8, activation: 'relu' }),
        tf.layers.dense({ units: 10, activation: 'sigmoid' }),
      ],
    });
  }

  /**
   * Detect anomaly using autoencoder reconstruction error
   */
  detectAnomaly(features: number[]): { isAnomaly: boolean; score: number } {
    // Placeholder implementation (requires trained autoencoder model)
    // Compute reconstruction error and compare to threshold
    const threshold = 0.05;

    // For now, return mock implementation
    // Real implementation would load trained autoencoder and compute reconstruction error
    const score = 0; // Placeholder

    return {
      isAnomaly: score > threshold,
      score,
    };
  }
}
