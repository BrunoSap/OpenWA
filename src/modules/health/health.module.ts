import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.health';
import { EngineHealthIndicator } from './indicators/engine.health';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [TerminusModule, SessionModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, EngineHealthIndicator],
})
export class HealthModule {}
