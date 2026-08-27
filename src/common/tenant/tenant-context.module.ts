import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';

/**
 * Module for tenant context propagation via AsyncLocalStorage
 * ClsModule provides request-scoped context storage without passing through function params
 */
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
      },
    }),
  ],
})
export class TenantContextModule {}
