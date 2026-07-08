import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringService } from './monitoring.service.js';
import { MonitoringPollerService } from './monitoring-poller.service.js';
import { MonitoringGateway } from './monitoring.gateway.js';
import { MikrotikModule } from '../mikrotik/mikrotik.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  // AuthModule → JwtService untuk verifikasi token saat handshake WebSocket.
  imports: [MikrotikModule, PrismaModule, AuthModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringPollerService, MonitoringGateway],
})
export class MonitoringModule {}
