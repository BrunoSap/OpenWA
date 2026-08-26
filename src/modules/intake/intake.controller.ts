import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IntakeService } from './intake.service';
import { ExportIntakeDto, IngestIntakeMessageDto } from './dto';
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
  @ApiOperation({ summary: 'Ingest an inbound WhatsApp message; advances the intake flow and returns the lead + next reply' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 201, description: 'Intake lead advanced (created or updated)' })
  async ingest(
    @Param('sessionId') sessionId: string,
    @Body() dto: IngestIntakeMessageDto,
  ): Promise<IntakeLead & { reply: string; step: string; completed: boolean }> {
    const { lead, reply, step, completed } = await this.intakeService.ingestMessage({
      sessionId,
      chatId: dto.chatId,
      text: dto.text,
    });
    // The bot needs the next question to send back to the user; the lead fields stay top-level so
    // the tracer (which reads body.id/chatId/intakeStatus) keeps working unchanged.
    return Object.assign(lead, { reply, step, completed });
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

  @Post('leads/:chatId/export')
  @HttpCode(200)
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Export a completed intake lead to an external URL (webhook out)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'chatId', description: 'WhatsApp chat id the lead is keyed by' })
  @ApiResponse({ status: 200, description: 'Export attempted; body reports delivery outcome' })
  @ApiResponse({ status: 404, description: 'No intake lead for this chat id' })
  @ApiResponse({ status: 409, description: 'Lead intake is not completed and cannot be exported' })
  async export(
    @Param('chatId') chatId: string,
    @Body() dto: ExportIntakeDto,
  ): Promise<{ delivered: boolean; status?: number }> {
    return this.intakeService.export(chatId, { url: dto.url, headers: dto.headers });
  }
}
