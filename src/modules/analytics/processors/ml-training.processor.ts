import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PredictiveModelsService } from '../services/predictive-models.service';

@Processor('analytics')
export class MLTrainingProcessor extends WorkerHost {
  private readonly logger = new Logger(MLTrainingProcessor.name);

  constructor(
    private readonly predictiveModelsService: PredictiveModelsService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case 'train-outcome-model':
        return this.handleTrainOutcomeModel(job);
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
        return;
    }
  }

  private async handleTrainOutcomeModel(job: Job): Promise<void> {
    this.logger.log('Starting outcome model training job...');

    try {
      const result = await this.predictiveModelsService.trainOutcomeModel();

      this.logger.log(
        `Training completed: val_accuracy=${result.valAccuracy.toFixed(4)}, duration=${result.trainingDurationMs}ms`,
      );

      // Just log the result, don't return it (void return type)
    } catch (error) {
      this.logger.error(`Training failed: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }
}
