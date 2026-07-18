import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [BillingModule], // reuse BillingService.getEffectiveLimit / getActiveSubscription
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
