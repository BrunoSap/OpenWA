import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('ml_model_versions')
export class MLModelVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, nullable: false })
  model_name: string; // 'outcome-model', 'volume-forecast', 'anomaly-detection'

  @Column({ type: 'varchar', length: 20, nullable: false })
  version: string; // Semantic versioning (e.g., 'v1.0.0')

  @Column({ type: 'timestamp', nullable: false })
  training_date: Date;

  @Column({ type: 'integer', nullable: false })
  dataset_size: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  accuracy: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    training_duration_ms?: number;
    epochs?: number;
    loss?: number;
    val_loss?: number;
  };

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;
}
