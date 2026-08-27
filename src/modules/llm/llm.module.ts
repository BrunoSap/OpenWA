import { Module } from '@nestjs/common';
import { LLMService } from './llm.service';

/**
 * Phase 6 Plan 02: LLM Module (DASH-02).
 *
 * Provides LLM service with analytics event emission.
 * EventEmitterModule is globally registered in app.module.ts (Phase 6 Plan 01),
 * so EventEmitter2 is available for injection without explicit import here.
 */
@Module({
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMModule {}
