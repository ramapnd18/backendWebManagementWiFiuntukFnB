import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { DuitkuService } from './duitku.service.js';

@Module({
  controllers: [BillingController],
  providers: [BillingService, DuitkuService],
  exports: [BillingService],
})
export class BillingModule {}
