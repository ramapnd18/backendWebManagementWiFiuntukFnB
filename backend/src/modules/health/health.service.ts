import { Injectable } from '@nestjs/common';
import * as net from 'net';
import * as dns from 'dns/promises';

/** Hasil satu percobaan koneksi TCP. */
export interface TcpProbe {
  target: string;
  ok: boolean;
  /** Kode error kernel (ENETUNREACH/ECONNREFUSED/ETIMEDOUT) bila gagal. */
  code?: string;
  ms: number;
}

export interface DbDiag {
  host: string | null;
  port: number | null;
  /** Hasil resolve DNS — null bila gagal. */
  dns: string[] | null;
  dnsError?: string;
  /** Uji TCP ke port DB. */
  tcp: TcpProbe | null;
  /** Uji TCP ke port 443 host yang sama — pembanding untuk membedakan
   *  "egress diblokir total" vs "port non-standar saja yang diblokir". */
  control443: TcpProbe | null;
}

@Injectable()
export class HealthService {
  /**
   * Ambil host & port dari DATABASE_URL TANPA membocorkan user/password.
   * Dipakai untuk diagnostik jaringan; nilai lain dari URL diabaikan.
   */
  private parseDbTarget(): { host: string | null; port: number | null } {
    const raw = process.env.DATABASE_URL;
    if (!raw) return { host: null, port: null };
    try {
      const u = new URL(raw);
      return {
        host: u.hostname || null,
        port: u.port ? Number(u.port) : 5432,
      };
    } catch {
      return { host: null, port: null };
    }
  }

  /** Coba buka koneksi TCP polos. Tak mengirim data apa pun, langsung tutup. */
  private probeTcp(host: string, port: number, timeoutMs = 5000): Promise<TcpProbe> {
    const target = `${host}:${port}`;
    const started = Date.now();
    return new Promise<TcpProbe>((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (ok: boolean, code?: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ target, ok, code, ms: Date.now() - started });
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false, 'ETIMEDOUT'));
      socket.once('error', (err: NodeJS.ErrnoException) =>
        finish(false, err.code ?? err.message),
      );
      socket.connect(port, host);
    });
  }

  /**
   * Diagnostik jaringan ke server database.
   *
   * Host & port diambil dari DATABASE_URL — TIDAK menerima input dari klien,
   * jadi endpoint ini tak bisa dipakai sebagai port scanner.
   */
  async diagnoseDb(): Promise<DbDiag> {
    const { host, port } = this.parseDbTarget();
    if (!host || !port) {
      return { host, port, dns: null, tcp: null, control443: null };
    }

    let addresses: string[] | null = null;
    let dnsError: string | undefined;
    try {
      const records = await dns.lookup(host, { all: true });
      addresses = records.map((r) => r.address);
    } catch (err) {
      dnsError = err instanceof Error ? err.message : String(err);
    }

    // DNS gagal → tak perlu uji TCP, penyebabnya sudah jelas.
    if (!addresses) {
      return { host, port, dns: null, dnsError, tcp: null, control443: null };
    }

    const [tcp, control443] = await Promise.all([
      this.probeTcp(host, port),
      this.probeTcp(host, 443),
    ]);

    return { host, port, dns: addresses, tcp, control443 };
  }

  /**
   * Uji egress umum ke internet, memakai IP mentah (tanpa DNS) agar hasilnya
   * memisahkan masalah routing dari masalah resolusi nama.
   *
   * Gunanya membedakan dua kondisi yang gejalanya mirip:
   * - hanya rute ke host DB yang hilang, atau
   * - container memang tak punya egress sama sekali.
   */
  async probeInternet(): Promise<TcpProbe[]> {
    return Promise.all([
      this.probeTcp('1.1.1.1', 443), // Cloudflare HTTPS
      this.probeTcp('8.8.8.8', 53), // Google DNS
    ]);
  }

  /**
   * Uji target tambahan dari env `DIAG_TARGETS` (format: "host:port,host:port").
   *
   * Sengaja dari env, BUKAN query param: nilainya hanya bisa diatur operator
   * lewat dashboard, sehingga endpoint ini tetap tak bisa disalahgunakan
   * sebagai port scanner oleh pengunjung. Dipakai untuk mencoba kandidat
   * hostname internal database tanpa perlu build ulang.
   */
  async probeCustomTargets(): Promise<TcpProbe[]> {
    const raw = process.env.DIAG_TARGETS;
    if (!raw) return [];

    const targets = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5); // batasi agar respons tetap cepat

    return Promise.all(
      targets.map((t) => {
        const idx = t.lastIndexOf(':');
        const host = idx === -1 ? t : t.slice(0, idx);
        const port = idx === -1 ? 5432 : Number(t.slice(idx + 1));
        return this.probeTcp(host, Number.isFinite(port) ? port : 5432);
      }),
    );
  }

  /** Ringkasan env penting — hanya status ada/tidak, nilainya tak pernah ditampilkan. */
  envPresence(): Record<string, boolean> {
    const keys = [
      'DATABASE_URL',
      'JWT_SECRET',
      'MIKROTIK_ENC_KEY',
      'FRONTEND_URL',
      'REDIS_HOST',
      'PORT',
    ];
    return Object.fromEntries(keys.map((k) => [k, Boolean(process.env[k])]));
  }
}
