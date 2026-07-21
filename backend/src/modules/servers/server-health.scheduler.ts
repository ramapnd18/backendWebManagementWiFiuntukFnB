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
 * Ping SEMUA router secara periodik (setInterval polos, tanpa library scheduler)
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
  private tickCount = 0; // untuk menjadwalkan prune retensi secara berkala
  private retentionDays = 30; // simpan histori healthcheck N hari (env HEALTH_RETENTION_DAYS)

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

    const retention = Number(
      this.configService.get<string>('HEALTH_RETENTION_DAYS') ?? 30,
    );
    if (Number.isFinite(retention) && retention > 0) {
      this.retentionDays = retention;
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
            const checkedAt = new Date();

            await this.prisma.mikrotikServer.update({
              where: { id: server.id },
              data: { lastStatus, lastCheckedAt: checkedAt },
            });

            // Catat SETIAP hasil cek (OK maupun gagal) sebagai histori penuh (B2).
            await this.prisma.routerHealthCheck.create({
              data: {
                serverId: server.id,
                status: lastStatus,
                latencyMs: result.success ? result.latency : null,
                checkedAt,
              },
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

      // Retensi: prune histori healthcheck lama secara berkala (tiap ~120 tick,
      // ≈ 1 jam pada interval default 30s) agar tabel tak membengkak.
      this.tickCount += 1;
      if (this.tickCount % 120 === 1) {
        await this.pruneOldHealthChecks();
      }
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

  /** Hapus histori healthcheck yang lebih tua dari `retentionDays`. */
  private async pruneOldHealthChecks() {
    const cutoff = new Date(
      Date.now() - this.retentionDays * 24 * 60 * 60 * 1000,
    );
    try {
      const { count } = await this.prisma.routerHealthCheck.deleteMany({
        where: { checkedAt: { lt: cutoff } },
      });
      if (count > 0) {
        this.logger.log(
          `Prune histori healthcheck: ${count} baris < ${this.retentionDays} hari dihapus.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Gagal prune histori healthcheck: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
