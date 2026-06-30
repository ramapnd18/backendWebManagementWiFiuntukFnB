/**
 * MikrotikModule — Shared Module
 *
 * Module ini di-export agar service-nya bisa di-inject di module lain.
 * Import module ini di ServersModule, VouchersModule, MonitoringModule, AiModule.
 */
import { Global, Module } from '@nestjs/common';
import { MikrotikService } from './mikrotik.service.js';

@Global() // Global agar tidak perlu import ulang di setiap module
@Module({
  providers: [MikrotikService],
  exports: [MikrotikService],
})
export class MikrotikModule {}
