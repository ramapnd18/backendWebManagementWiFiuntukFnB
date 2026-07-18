import { Module } from '@nestjs/common';
import { PosController } from './pos.controller.js';
import { PosService } from './pos.service.js';
import { PosKeysController } from './pos-keys.controller.js';
import { PosKeysService } from './pos-keys.service.js';
import { PosTransactionsController } from './pos-transactions.controller.js';
import { PosApiKeyGuard } from './guards/pos-api-key.guard.js';
import { BillingModule } from '../billing/billing.module.js';

/**
 * Modul Integrasi POS.
 *
 * PrismaService, MikrotikService, dan ActivityLogService semuanya @Global.
 * BillingModule diimpor untuk penegakan kuota/fitur (apiKeyAccess) pada
 * pembuatan API key POS. JwtAuthGuard memakai strategy 'jwt' global (AuthModule).
 */
@Module({
  imports: [BillingModule],
  controllers: [PosController, PosKeysController, PosTransactionsController],
  providers: [PosService, PosKeysService, PosApiKeyGuard],
})
export class PosModule {}
