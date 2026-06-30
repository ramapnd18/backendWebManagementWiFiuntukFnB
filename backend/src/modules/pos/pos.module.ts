import { Module } from '@nestjs/common';
import { PosController } from './pos.controller.js';
import { PosService } from './pos.service.js';
import { PosKeysController } from './pos-keys.controller.js';
import { PosKeysService } from './pos-keys.service.js';
import { PosApiKeyGuard } from './guards/pos-api-key.guard.js';

/**
 * Modul Integrasi POS.
 *
 * Tidak perlu `imports` — PrismaService, MikrotikService, dan ActivityLogService
 * semuanya @Global. JwtAuthGuard memakai strategy 'jwt' yang didaftarkan global
 * oleh AuthModule.
 */
@Module({
  controllers: [PosController, PosKeysController],
  providers: [PosService, PosKeysService, PosApiKeyGuard],
})
export class PosModule {}
