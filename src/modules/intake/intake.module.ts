import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntakeLead } from './entities/intake-lead.entity';
import { IntakeService } from './intake.service';
import { IntakeController } from './intake.controller';

/**
 * Wires the intake bot: the IntakeLead repository on the named 'data' connection (forFeature's
 * connection arg is mandatory — it is what makes @InjectRepository(IntakeLead, 'data') resolve),
 * the HTTP controller, and the service (exported so Plan 02's conversational flow can reuse it).
 */
@Module({
  imports: [TypeOrmModule.forFeature([IntakeLead], 'data')],
  controllers: [IntakeController],
  providers: [IntakeService],
  exports: [IntakeService],
})
export class IntakeModule {}
