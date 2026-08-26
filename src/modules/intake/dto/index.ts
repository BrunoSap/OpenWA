import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/**
 * Inbound intake message body. Validated by the global ValidationPipe (whitelist +
 * forbidNonWhitelisted), the first trust boundary the untrusted WhatsApp/n8n payload crosses
 * (threat T-01-01). MaxLength bounds keep an oversized chatId/text from reaching the DB.
 */
export class IngestIntakeMessageDto {
  @ApiProperty({ description: 'WhatsApp chat id the lead is keyed by', example: '5511999999999@c.us' })
  @IsString()
  @MaxLength(100)
  chatId!: string;

  @ApiProperty({ description: 'Raw message text collected during intake', example: 'Preciso de ajuda com...' })
  @IsString()
  @MaxLength(4096)
  text!: string;
}

/** Public shape of a persisted intake lead — the response the ingest and read routes return. */
export interface IntakeLeadResponse {
  id: number;
  chatId: string;
  caseType: string;
  urgencyLevel: string;
  intakeStatus: string;
  caseData: Record<string, unknown>;
  intakeStartedAt: Date;
  updatedAt: Date;
}
