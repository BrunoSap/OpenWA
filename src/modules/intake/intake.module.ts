import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntakeLead } from './entities/intake-lead.entity';
import { IntakeService } from './intake.service';
import { IntakeController } from './intake.controller';
import { AnalyticsModule } from '../analytics/analytics.module';

/**
 * Wires the intake bot: the IntakeLead repository on the named 'data' connection (forFeature's
 * connection arg is mandatory — it is what makes @InjectRepository(IntakeLead, 'data') resolve),
 * the HTTP controller, and the service (exported so Plan 02's conversational flow can reuse it).
 * Phase 10 Plan 02: Imports AnalyticsModule for ABTestingService (funnel variant assignment).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([IntakeLead], 'data'),
    AnalyticsModule,
  ],
  controllers: [IntakeController],
  providers: [IntakeService],
  exports: [IntakeService],
})
export class IntakeModule {}
