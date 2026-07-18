/**
 * AiModule
 *
 * Module NestJS untuk fitur AI Analysis.
 * Mengimpor MikrotikModule untuk mengakses MikrotikService.
 */
import { Module } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { MikrotikModule } from '../mikrotik/mikrotik.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [MikrotikModule, PrismaModule, BillingModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
