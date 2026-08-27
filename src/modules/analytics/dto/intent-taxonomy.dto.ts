import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Phase 10 Plan 01 Task 2: Intent taxonomy DTO for CRUD operations.
 *
 * Used for POST /api/analytics/intents/taxonomy and PUT /api/analytics/intents/taxonomy/:id.
 */
export class IntentTaxonomyDto {
  @ApiProperty({
    description: 'Intent name (unique per tenant)',
    example: 'FAQ',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  intent_name!: string;

  @ApiPropertyOptional({
    description: 'Intent description',
    example: 'Perguntas frequentes sobre produto/serviço',
  })
  @IsOptional()
  @IsString()
  intent_description?: string;

  @ApiPropertyOptional({
    description: 'Few-shot examples for classification',
    example: ['Como faço para resetar minha senha?', 'Onde encontro o manual?'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  examples?: string[];
}
