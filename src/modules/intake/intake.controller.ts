import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IntakeService } from './intake.service';
import { IngestIntakeMessageDto } from './dto';
import { IntakeLead } from './entities/intake-lead.entity';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

/**
 * HTTP surface of the intake bot. Both routes require an OPERATOR API key (threat T-01-02): the n8n
 * workflow (Plan 03) calls these with an OPERATOR key, and there is no @Public escape hatch — the
 * existing ApiKeyGuard enforces the role. The untrusted body is validated by IngestIntakeMessageDto.
 */
@ApiTags('intake')
@Controller('sessions/:sessionId/intake')
export class IntakeController {
  constructor(private readonly intakeService: IntakeService) {}

  @Post('messages')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Ingest an inbound WhatsApp message into an intake lead (upsert by chat_id)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 201, description: 'Intake lead created or updated' })
  async ingest(
    @Param('sessionId') sessionId: string,
    @Body() dto: IngestIntakeMessageDto,
  ): Promise<IntakeLead> {
    return this.intakeService.ingestMessage({ sessionId, chatId: dto.chatId, text: dto.text });
  }

  @Get('leads/:chatId')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Read the intake lead for a chat id' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'chatId', description: 'WhatsApp chat id the lead is keyed by' })
  @ApiResponse({ status: 200, description: 'The persisted intake lead' })
  @ApiResponse({ status: 404, description: 'No intake lead for this chat id' })
  async read(@Param('chatId') chatId: string): Promise<IntakeLead> {
    return this.intakeService.getByChatId(chatId);
  }
}
