import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ConversationMemoryService } from './services/conversation-memory.service';
import { GetConversationHistoryDto } from './dto/get-conversation-history.dto';
import { ConversationContextDto } from './dto/conversation-context.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

/**
 * Phase 5 Plan 02: Memory REST endpoints (MEM-04).
 *
 * Exposes conversation history and LLM context for n8n workflows to consume.
 * Both endpoints require OPERATOR role (T-05-04) and scope strictly on the
 * userId path parameter (no cross-user leakage).
 */
@ApiTags('memory')
@Controller('memory')
export class MemoryController {
  constructor(private readonly memoryService: ConversationMemoryService) {}

  /**
   * Get paginated conversation history for a user.
   *
   * @param userId - User identifier (author for groups, from for 1:1)
   * @param query - Pagination params (take, skip)
   * @returns Paginated messages and total count
   *
   * @remarks
   * - Scoped by userId path param (T-05-04: no cross-user rows)
   * - Take clamped to max 100 (T-05-05)
   * - Requires OPERATOR api-key
   */
  @Get('users/:userId/history')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get paginated conversation history for a user' })
  @ApiParam({ name: 'userId', description: 'User identifier to fetch history for' })
  @ApiResponse({ status: 200, description: 'Paginated message history' })
  async getHistory(
    @Param('userId') userId: string,
    @Query() query: GetConversationHistoryDto,
  ): Promise<{ messages: any[]; total: number }> {
    // Clamp take to max 100 (T-05-05)
    const take = Math.min(query.take || 50, 100);
    const skip = query.skip || 0;

    return this.memoryService.getUserHistory(userId, { skip, take });
  }

  /**
   * Get LLM context for a user (sliding window + summary).
   *
   * @param userId - User identifier to build context for
   * @returns Context with summary, recent messages, total count
   *
   * @remarks
   * - Scoped by userId path param (T-05-04)
   * - Requires OPERATOR api-key
   * - Consumed by n8n LLM workflows to enrich prompts
   */
  @Get('users/:userId/context')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Get LLM context (sliding window + summary) for a user' })
  @ApiParam({ name: 'userId', description: 'User identifier to build context for' })
  @ApiResponse({ status: 200, description: 'LLM context payload' })
  async getContext(@Param('userId') userId: string): Promise<ConversationContextDto> {
    return this.memoryService.buildLLMContext(userId);
  }
}
