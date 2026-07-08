import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { MikrotikService } from '../mikrotik/mikrotik.service.js';
import { ActivityLogService } from '../activity-log/activity-log.service.js';
import { decryptSecret } from '../../common/crypto.util.js';

/**
 * Health scheduler terpusat (B4).
 *
 * Ping SEMUA router secara periodik (setInterval, tanpa BullMQ/@nestjs/schedule)
 * lalu perbarui `lastStatus` + `lastCheckedAt` di DB. Tujuannya agar badge status
 * di `/servers` segar walau tak ada "Test Koneksi" manual maupun polling frontend.
 *
 * Interval diatur via env `SERVER_HEALTH_INTERVAL_MS` (default 30000ms).
 * Set <= 0 untuk menonaktifkan (mis. saat test/CI).
 */
@Injectable()
export class ServerHealthScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServerHealthScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private isRunning = false; // cegah tick tumpang-tindih bila 1 putaran lambat

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(
      this.configService.get<string>('SERVER_HEALTH_INTERVAL_MS') ?? 30000,
    );

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      this.logger.log('Health scheduler dinonaktifkan (interval <= 0).');
      return;
    }

    this.logger.log(`Health scheduler aktif: ping router tiap ${intervalMs}ms.`);
    // Jangan biarkan interval menahan proses tetap hidup saat shutdown.
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Satu putaran health-check: tes semua server, update status yang berubah. */
  private async tick() {
    if (this.isRunning) return; // putaran sebelumnya belum selesai → lewati
    this.isRunning = true;
    try {
      const servers = await this.prisma.mikrotikServer.findMany();

      await Promise.all(
        servers.map(async (server) => {
          try {
            const result = await this.mikrotikService.testConnection(
              server.host,
              server.port,
              server.username,
              decryptSecret(server.password),
              server.useSSL,
            );
            const lastStatus = result.success ? 'ONLINE' : 'OFFLINE';

            await this.prisma.mikrotikServer.update({
              where: { id: server.id },
              data: { lastStatus, lastCheckedAt: new Date() },
            });

            // Catat log HANYA saat status berubah ONLINE→OFFLINE (hindari spam tiap tick).
            if (server.lastStatus !== 'OFFLINE' && lastStatus === 'OFFLINE') {
              await this.activityLogService.logAction({
                action: 'ROUTER_CONNECTION_FAILED',
                serverId: server.id,
                entity: 'MikrotikServer',
                entityId: server.id,
                detail: `Router "${server.name}" terdeteksi OFFLINE oleh health scheduler: ${result.error ?? 'tidak dapat terhubung'}`,
              });
            }
          } catch (err) {
            this.logger.warn(
              `Gagal health-check router ${server.id} (${server.name}): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }),
      );
    } catch (err) {
      this.logger.error(
        `Health scheduler tick gagal: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
