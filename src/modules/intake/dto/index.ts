import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

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

/**
 * Target of a qualified-lead export (POST /export). The lead payload (personal data) leaves the
 * system for the caller-supplied `url`, so this is a trust boundary (threat T-02-01): @IsUrl bounds
 * the destination shape, the route requires an OPERATOR key, and the SSRF guard on the delivery path
 * decides whether the host is actually reachable. Only 'completed' leads are exportable (service-side).
 */
export class ExportIntakeDto {
  @ApiProperty({ description: 'Destination URL the qualified lead is POSTed to', example: 'https://crm.example.com/leads' })
  // require_tld:false allows internal hostnames (e.g. http://n8n:5678); the SSRF guard still decides
  // whether the host may actually be delivered to.
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({ description: 'Optional custom headers for the export POST', example: { Authorization: 'Bearer ...' } })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
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
