import { Module } from '@nestjs/common';
import { ServersService } from './servers.service.js';
import { ServersController } from './servers.controller.js';
import { ServerHealthScheduler } from './server-health.scheduler.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [BillingModule],
  controllers: [ServersController],
  providers: [ServersService, ServerHealthScheduler],
  exports: [ServersService],
})
export class ServersModule {}
