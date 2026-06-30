/* eslint-disable @typescript-eslint/no-require-imports */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { decryptSecret } from '../../common/crypto.util.js';

// ─── RouterOS Binary API (v6 + v7) ───────────────────────────────────────────
const { RouterOSAPI } = require('routeros-client') as typeof import('routeros-client');

// Patch node-routeros: RouterOS v7 kirim reply '!empty' (list kosong) sebelum
// '!done'. Library tidak kenal reply ini — default branch memanggil this.close()
// lalu !done datang ke tag yang sudah di-unregister → UNREGISTEREDTAG crash.
// Fix: skip packet '!empty', biarkan '!done' resolve promise dengan [] seperti biasa.
const { Channel } = require('node-routeros/dist/Channel') as { Channel: any };
const _origProcessPacket = Channel.prototype.processPacket as (p: string[]) => void;
Channel.prototype.processPacket = function (packet: string[]) {
  if (packet[0] === '!empty') return; // v7: diikuti !done, abaikan saja
  _origProcessPacket.call(this, packet);
};

/**
 * Buat instance RouterOSAPI dengan listener 'error' terpasang.
 *
 * node-routeros membungkus TLSSocket; saat koneksi SSL gagal (mis. port 8729
 * tapi router tidak SSL, atau handshake TLS error) socket meng-emit event
 * 'error' SECARA ASYNC di luar promise connect(). Tanpa listener, Node
 * menganggapnya "Unhandled 'error' event" dan MEMATIKAN seluruh proses backend.
 *
 * Listener no-op di sini menyerap event tersebut agar tidak fatal; kegagalan
 * tetap dilaporkan lewat promise connect()/write() yang ditangani try/catch.
 */
function createApi(opts: any) {
  const api: any = new RouterOSAPI(opts);
  api.on?.('error', () => {
    /* diserap — error sebenarnya tetap di-reject lewat connect()/write() */
  });
  return api;
}
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class MikrotikService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Helper RouterOS Binary API — pengganti request() berbasis HTTP/REST.
   * Mendukung RouterOS v6 (port 8728) dan v7 (port 8728/8729).
   * Pola: connect → write → close (stateless, satu operasi per koneksi).
   */
  private async apiRequest(
    host: string,
    port: number,
    username: string,
    password: string,
    useSsl: boolean,
    command: string,
    params: string[] = [],
    timeoutSec: number = 5,
  ): Promise<any[]> {
    const api = createApi({
      host,
      user: username,
      password,
      port: port || (useSsl ? 8729 : 8728),
      ...(useSsl ? { tls: { rejectUnauthorized: false } } : {}),
      timeout: timeoutSec,
    });

    try {
      await api.connect();
      const result = await api.write(command, params);
      return Array.isArray(result) ? result : [];
    } catch (error: any) {
      const msg: string = error?.message ?? String(error);
      if (
        msg.includes('ETIMEDOUT') ||
        msg.includes('timeout') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('EHOSTUNREACH')
      ) {
        throw new BadRequestException(
          `Koneksi ke MikroTik timeout setelah ${timeoutSec * 1000}ms`,
        );
      }
      if (
        msg.includes('cannot log in') ||
        msg.includes('invalid user') ||
        msg.includes('EAUTH') ||
        msg.toLowerCase().includes('wrong credentials')
      ) {
        throw new BadRequestException(
          'Kredensial MikroTik salah atau akses ditolak',
        );
      }
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Koneksi ke MikroTik gagal: ${msg}`,
      );
    } finally {
      await api.close().catch(() => {});
    }
  }

  /**
   * Helper untuk mendapatkan kredensial server berdasarkan ID.
   */
  private async getServerCredentials(serverId: string) {
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException(
        'Server MikroTik tidak ditemukan di database',
      );
    }
    // Dekripsi password at-rest → plaintext untuk dipakai semua method MikroTik
    return { ...server, password: decryptSecret(server.password) };
  }

  /**
   * Buat koneksi dan verifikasi kredensial router MikroTik.
   */
  async connect(
    host: string,
    port: number,
    username: string,
    password: string,
    useSsl: boolean = false,
  ) {
    const result = await this.apiRequest(
      host, port, username, password, useSsl,
      '/system/resource/print',
    );
    return result[0] ?? {};
  }

  /**
   * Test koneksi ke router dan hitung latensi.
   */
  async testConnection(
    host: string,
    port: number,
    username: string,
    password: string,
    useSsl: boolean = false,
  ) {
    const start = Date.now();
    try {
      await this.connect(host, port, username, password, useSsl);
      const latency = Date.now() - start;
      return { success: true, latency, error: undefined };
    } catch (error: any) {
      return {
        success: false,
        latency: 0,
        error: error.message || 'Koneksi gagal',
      };
    }
  }

  /**
   * Ambil daftar hotspot user profile dari router.
   */
  async getHotspotProfiles(serverId: string) {
    const creds = await this.getServerCredentials(serverId);
    return this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/ip/hotspot/user/profile/print',
    );
  }

  /**
   * Ambil daftar user hotspot aktif saat ini.
   */
  async getActiveUsers(serverId: string) {
    const creds = await this.getServerCredentials(serverId);
    return this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/ip/hotspot/active/print',
    );
  }

  /**
   * Ambil daftar semua user hotspot yang terdaftar di router.
   */
  async getHotspotUsers(serverId: string) {
    const creds = await this.getServerCredentials(serverId);
    return this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/ip/hotspot/user/print',
    );
  }

  /**
   * Ambil statistik resource system (CPU, RAM, HDD, Uptime) dari router.
   */
  async getSystemResource(serverId: string) {
    const creds = await this.getServerCredentials(serverId);
    const result = await this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/system/resource/print',
    );
    return result[0] ?? {};
  }

  /**
   * Ambil daftar interface beserta statistik traffic (RX/TX) dari router.
   */
  async getInterfaces(serverId: string) {
    const creds = await this.getServerCredentials(serverId);
    return this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/interface/print',
    );
  }

  /**
   * Ambil konfigurasi lengkap hotspot untuk AI analysis.
   * Data yang diambil: system resource, profile, pool, dhcp, dns, hotspot user.
   */
  async getFullConfig(serverId: string) {
    const creds = await this.getServerCredentials(serverId);

    const commands: Record<string, string> = {
      resources:   '/system/resource/print',
      profiles:    '/ip/hotspot/user/profile/print',
      pools:       '/ip/pool/print',
      dhcpServers: '/ip/dhcp-server/print',
      dns:         '/ip/dns/print',
      hotspots:    '/ip/hotspot/print',
      users:       '/ip/hotspot/user/print',
    };

    const results: Record<string, any> = {};

    const promises = Object.entries(commands).map(async ([key, cmd]) => {
      try {
        const data = await this.apiRequest(
          creds.host, creds.port, creds.username, creds.password, creds.useSSL,
          cmd, [], 4,
        );
        // resources adalah objek tunggal, sisanya array
        results[key] = key === 'resources' ? (data[0] ?? {}) : data;
      } catch (error: any) {
        results[key] = { error: error.message || 'Gagal mengambil data' };
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Daftarkan hotspot user profile baru di router.
   */
  async createHotspotProfile(
    serverId: string,
    name: string,
    rateLimit: string,
    sessionTimeout?: string,
    idleTimeout?: string,
    sharedUsers: number = 1,
  ) {
    const creds = await this.getServerCredentials(serverId);
    const params = [
      `=name=${name}`,
      `=rate-limit=${rateLimit}`,
      `=shared-users=${sharedUsers}`,
    ];
    if (sessionTimeout) params.push(`=session-timeout=${sessionTimeout}`);
    if (idleTimeout)    params.push(`=idle-timeout=${idleTimeout}`);

    return this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/ip/hotspot/user/profile/add', params,
    );
  }

  /**
   * Hapus hotspot user profile dari router.
   */
  async removeHotspotProfile(serverId: string, name: string) {
    const creds = await this.getServerCredentials(serverId);

    const found = await this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/ip/hotspot/user/profile/print', [`?name=${name}`],
    );

    if (!found.length) return { success: true };

    const internalId: string = found[0]['.id'];
    if (!internalId) return { success: true };

    await this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/ip/hotspot/user/profile/remove', [`=.id=${internalId}`],
    );
    return { success: true };
  }

  /**
   * Buat hotspot user baru di router (untuk voucher).
   */
  async createHotspotUser(
    serverId: string,
    username: string,
    password: string,
    profile: string,
  ) {
    const creds = await this.getServerCredentials(serverId);
    await this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/ip/hotspot/user/add',
      [`=name=${username}`, `=password=${password}`, `=profile=${profile}`],
    );
  }

  /**
   * Hapus hotspot user dari router (revoke voucher).
   */
  async removeHotspotUser(serverId: string, username: string) {
    const creds = await this.getServerCredentials(serverId);

    const found = await this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/ip/hotspot/user/print', [`?name=${username}`],
    );

    if (!found.length) {
      throw new NotFoundException(
        `User hotspot "${username}" tidak ditemukan di router`,
      );
    }

    const internalId: string = found[0]['.id'];
    if (!internalId) {
      throw new BadRequestException(
        `Gagal mendapatkan ID internal untuk user "${username}"`,
      );
    }

    await this.apiRequest(
      creds.host, creds.port, creds.username, creds.password, creds.useSSL,
      '/ip/hotspot/user/remove', [`=.id=${internalId}`],
    );
    return { success: true };
  }

  /**
   * Hapus banyak hotspot user dalam SATU koneksi (untuk bulk delete).
   *
   * Menghindari connection storm: alih-alih 2 koneksi per user (print + remove)
   * yang dijalankan paralel, method ini buka 1 koneksi, print seluruh user SEKALI
   * untuk membangun map name→.id, lalu remove tiap user sekuensial di koneksi sama.
   *
   * Return korelasi hasil agar caller bisa hapus DB hanya untuk yang benar-benar
   * terhapus / sudah tidak ada di router (partial-safe):
   * - removed:  berhasil dihapus dari router
   * - notFound: sudah tidak ada di router (aman dihapus dari DB)
   * - failed:   gagal dihapus (TETAP di DB, bisa di-retry)
   */
  async removeHotspotUsersByNames(
    serverId: string,
    names: string[],
  ): Promise<{ removed: string[]; notFound: string[]; failed: string[] }> {
    const removed: string[] = [];
    const notFound: string[] = [];
    const failed: string[] = [];

    if (names.length === 0) return { removed, notFound, failed };

    const creds = await this.getServerCredentials(serverId);

    const api = createApi({
      host: creds.host,
      user: creds.username,
      password: creds.password,
      port: creds.port || (creds.useSSL ? 8729 : 8728),
      ...(creds.useSSL ? { tls: { rejectUnauthorized: false } } : {}),
      timeout: 15,
    });

    try {
      await api.connect();

      // Print seluruh user sekali → map name → .id
      const allUsers: any[] = await api.write('/ip/hotspot/user/print');
      const idByName = new Map<string, string>();
      for (const u of allUsers) {
        if (u?.name && u['.id']) idByName.set(u.name, u['.id']);
      }

      // Remove sekuensial di koneksi yang sama
      for (const name of names) {
        const internalId = idByName.get(name);
        if (!internalId) {
          notFound.push(name); // sudah tidak ada di router
          continue;
        }
        try {
          await api.write('/ip/hotspot/user/remove', [`=.id=${internalId}`]);
          removed.push(name);
        } catch {
          failed.push(name); // gagal hapus item ini, lanjut item berikutnya
        }
      }
    } catch {
      // Koneksi/print gagal total → semua nama yang belum diproses = failed (tetap di DB)
      const processed = new Set([...removed, ...notFound, ...failed]);
      for (const name of names) {
        if (!processed.has(name)) failed.push(name);
      }
    } finally {
      await api.close().catch(() => {});
    }

    return { removed, notFound, failed };
  }

  /**
   * Ambil snapshot monitoring (active users + system resource + interfaces) dalam
   * SATU koneksi. Optimasi beban router: 1 login + 3 perintah, bukan 3 koneksi+login
   * terpisah seperti memanggil getActiveUsers/getSystemResource/getInterfaces sendiri.
   * Mengembalikan data MENTAH (mapping dilakukan di MonitoringService).
   */
  async getMonitoringSnapshot(serverId: string): Promise<{
    active: any[];
    resource: any;
    interfaces: any[];
  }> {
    const creds = await this.getServerCredentials(serverId);

    const api = createApi({
      host: creds.host,
      user: creds.username,
      password: creds.password,
      port: creds.port || (creds.useSSL ? 8729 : 8728),
      ...(creds.useSSL ? { tls: { rejectUnauthorized: false } } : {}),
      timeout: 10,
    });

    try {
      await api.connect();
      // Sekuensial pada koneksi yang sama (tetap 1 login)
      const active = await api.write('/ip/hotspot/active/print');
      const resource = await api.write('/system/resource/print');
      const interfaces = await api.write('/interface/print');

      return {
        active: Array.isArray(active) ? active : [],
        resource: Array.isArray(resource) ? (resource[0] ?? {}) : {},
        interfaces: Array.isArray(interfaces) ? interfaces : [],
      };
    } finally {
      await api.close().catch(() => {});
    }
  }
}
