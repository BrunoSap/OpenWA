import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Phase 10 Plan 02 Task 3: DTO for A/B experiment creation and updates (DASH-04).
 */
export class ABExperimentDto {
  @IsString()
  @IsNotEmpty()
  experiment_id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Type(() => Number)
  variant_count?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variant_names?: string[];

  @IsDateString()
  start_date!: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}
