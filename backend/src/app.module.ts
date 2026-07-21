import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { MikrotikModule } from './modules/mikrotik/mikrotik.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ServersModule } from './modules/servers/servers.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { VouchersModule } from './modules/vouchers/vouchers.module.js';
import { MonitoringModule } from './modules/monitoring/monitoring.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { ActivityLogModule } from './modules/activity-log/activity-log.module.js';
import { PosModule } from './modules/pos/pos.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { PlansModule } from './modules/plans/plans.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { HealthModule } from './modules/health/health.module.js';
import appConfig from './config/app.config.js';
import jwtConfig from './config/jwt.config.js';
import redisConfig from './config/redis.config.js';

@Module({
  imports: [
    // ─── Config (global, tersedia di semua module) ─────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, redisConfig],
      envFilePath: '.env',
    }),

    // ─── Rate Limiting (global) ────────────────────────────────────────────
    // Default: 100 req / menit / IP. Endpoint sensitif override via @Throttle.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 100 },
    ]),

    // ─── Database (global, PrismaService tersedia di semua module) ─────────
    PrismaModule,

    // ─── MikroTik Shared Module (global) ───────────────────────────────────
    MikrotikModule,

    // ─── Feature Modules (akan ditambahkan bertahap per fase) ──────────────
    AuthModule,
    ServersModule,
    ProfilesModule,
    VouchersModule,
    MonitoringModule,
    AiModule,
    ActivityLogModule,
    PosModule,
    UsersModule,
    BillingModule,
    PlansModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Rate limiting global — terapkan ThrottlerGuard ke semua route
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
