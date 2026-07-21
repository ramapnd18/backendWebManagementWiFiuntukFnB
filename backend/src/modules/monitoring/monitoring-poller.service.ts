import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MonitoringService } from './monitoring.service.js';

/** Snapshot yang di-push ke klien (bentuk dari MonitoringService.fetchSnapshot). */
export type Snapshot = Awaited<ReturnType<MonitoringService['fetchSnapshot']>>;

type Emitter = (
  serverId: string,
  event: 'snapshot' | 'status',
  payload: unknown,
) => void;

interface Sub {
  count: number; // jumlah klien yang subscribe server ini
  name: string; // nama server (untuk mapping resource)
}

/**
 * Poller monitoring TERPUSAT (B7).
 *
 * Router RouterOS tidak bisa push, jadi backend tetap men-*poll*-nya — tapi **satu kali
 * per router** (interval `MONITORING_POLL_INTERVAL_MS`, default 3000ms) **hanya** untuk
 * server yang punya minimal 1 subscriber WebSocket. Hasilnya di-*diff* vs snapshot
 * terakhir; hanya saat BERUBAH di-*push* ke room lewat emitter (gateway).
 *
 * Efek: berapapun jumlah klien, router cuma di-poll 1×/interval → melindungi router,
 * dan klien tak perlu polling sendiri (freshness < interval).
 *
 * Cache snapshot disimpan in-memory (Map) — cukup untuk deployment single-instance.
 * Untuk scale horizontal (banyak instance), cache + fan-out perlu dipindah ke
 * penyimpanan bersama dengan mekanisme pub/sub.
 */
@Injectable()
export class MonitoringPollerService implements OnModuleDestroy {
  private readonly logger = new Logger(MonitoringPollerService.name);
  private readonly intervalMs: number;

  private timer?: ReturnType<typeof setInterval>;
  private isPolling = false; // cegah putaran tumpang-tindih
  private emit?: Emitter;

  private readonly subs = new Map<string, Sub>();
  private readonly lastSnapshot = new Map<string, string>(); // serverId → JSON
  private readonly offline = new Set<string>(); // server yang sedang gagal (untuk emit transisi)

  constructor(
    private readonly configService: ConfigService,
    private readonly monitoringService: MonitoringService,
  ) {
    this.intervalMs = Number(
      this.configService.get<string>('MONITORING_POLL_INTERVAL_MS') ?? 3000,
    );
  }

  /** Gateway mendaftarkan cara push ke room di sini (hindari circular dependency). */
  setEmitter(emit: Emitter) {
    this.emit = emit;
  }

  /** Snapshot terakhir yang diketahui (untuk dikirim ke klien yang baru join). */
  getLast(serverId: string): Snapshot | null {
    const raw = this.lastSnapshot.get(serverId);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  }

  /** Tambah 1 subscriber untuk server. Subscriber pertama memicu poll segera. */
  addSubscriber(serverId: string, name: string) {
    const existing = this.subs.get(serverId);
    if (existing) {
      existing.count += 1;
    } else {
      this.subs.set(serverId, { count: 1, name });
      // Subscriber pertama: poll sekarang agar klien tak menunggu 1 interval penuh.
      void this.pollOne(serverId);
    }
    this.ensureTimer();
  }

  /** Kurangi 1 subscriber. Saat mencapai 0, berhenti poll server itu. */
  removeSubscriber(serverId: string) {
    const existing = this.subs.get(serverId);
    if (!existing) return;
    existing.count -= 1;
    if (existing.count <= 0) {
      this.subs.delete(serverId);
      this.lastSnapshot.delete(serverId);
      this.offline.delete(serverId);
    }
    if (this.subs.size === 0) this.stopTimer();
  }

  onModuleDestroy() {
    this.stopTimer();
  }

  // ─── internal ───────────────────────────────────────────────────────────────

  private ensureTimer() {
    if (this.timer || this.intervalMs <= 0) return;
    this.logger.log(
      `Poller monitoring aktif: interval ${this.intervalMs}ms (poll hanya server ber-subscriber).`,
    );
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async tick() {
    if (this.isPolling) return; // putaran sebelumnya belum kelar → lewati
    this.isPolling = true;
    try {
      const serverIds = [...this.subs.keys()];
      await Promise.all(serverIds.map((id) => this.pollOne(id)));
    } finally {
      this.isPolling = false;
    }
  }

  /** Poll 1 server, diff, push ke room hanya bila berubah. */
  private async pollOne(serverId: string) {
    const sub = this.subs.get(serverId);
    if (!sub) return;

    try {
      const snapshot = await this.monitoringService.fetchSnapshot(
        serverId,
        sub.name,
      );
      const json = JSON.stringify(snapshot);

      // Pulih dari OFFLINE → beri tahu klien router tersambung lagi.
      if (this.offline.delete(serverId)) {
        this.emit?.(serverId, 'status', { serverId, connected: true });
      }

      // Push hanya bila berubah (atau snapshot pertama).
      if (this.lastSnapshot.get(serverId) !== json) {
        this.lastSnapshot.set(serverId, json);
        this.emit?.(serverId, 'snapshot', snapshot);
      }
    } catch (error: any) {
      // Emit status OFFLINE hanya sekali per transisi (hindari spam tiap interval).
      if (!this.offline.has(serverId)) {
        this.offline.add(serverId);
        this.emit?.(serverId, 'status', {
          serverId,
          connected: false,
          error: error?.message ?? 'Router tidak dapat dihubungi',
        });
      }
      this.logger.warn(
        `Poll gagal untuk server ${serverId}: ${error?.message ?? error}`,
      );
    }
  }
}
