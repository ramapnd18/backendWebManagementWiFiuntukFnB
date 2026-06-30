import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringService } from './monitoring.service.js';
import { MikrotikModule } from '../mikrotik/mikrotik.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [MikrotikModule, PrismaModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}
