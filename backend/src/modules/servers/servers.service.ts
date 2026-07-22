/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MikrotikService } from '../mikrotik/mikrotik.service.js';
import { ActivityLogService } from '../activity-log/activity-log.service.js';
import { BillingService } from '../billing/billing.service.js';
import { CreateServerDto } from './dto/create-server.dto.js';
import { UpdateServerDto } from './dto/update-server.dto.js';
import { TestConnectionDto } from './dto/test-connection.dto.js';
import { encryptSecret, decryptSecret } from '../../common/crypto.util.js';
import {
  type AuthUser,
  serverScopeWhere,
  assertOwnerAccess,
} from '../../common/scope.util.js';

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
    private readonly activityLogService: ActivityLogService,
    private readonly billingService: BillingService,
  ) {}

  /** Buang field password dari objek server sebelum dikirim ke klien. */
  private stripPassword<T extends { password?: string }>(server: T): Omit<T, 'password'> {
    const { password: _pw, ...safe } = server;
    return safe;
  }

  async create(createServerDto: CreateServerDto, ownerId: string) {
    const { name, host, port, username, password, useSSL } = createServerDto;

    // Validasi kuota paket langganan sebelum menambah router
    await this.billingService.assertCanAddRouter(ownerId);

    // Port RouterOS API binary: 8728 (api) / 8729 (api-ssl). BUKAN 80/443 —
    // itu port web, bukan service API yang dipakai `routeros-client`.
    const resolvedPort = port || (useSSL ? 8729 : 8728);

    // Cek duplikat berdasarkan HOST + PORT, bukan host saja: beberapa router bisa
    // berada di balik satu IP publik yang sama dengan port-forward berbeda —
    // lazim untuk multi-outlet. Tetap di-scope per-owner (isolasi antar tenant).
    const existingServer = await this.prisma.mikrotikServer.findFirst({
      where: { host, port: resolvedPort, ownerId },
    });
    if (existingServer) {
      throw new BadRequestException(
        `Router dengan host ${host} port ${resolvedPort} sudah terdaftar`,
      );
    }

    const server = await this.prisma.mikrotikServer.create({
      data: {
        ownerId,
        name,
        host,
        port: resolvedPort,
        username,
        password: encryptSecret(password), // enkripsi at-rest (AES-256-GCM)
        useSSL: useSSL ?? false,
      },
    });

    await this.activityLogService.logAction({
      action: 'SERVER_CREATED',
      serverId: server.id,
      entity: 'MikrotikServer',
      entityId: server.id,
      detail: `Router baru ditambahkan: ${name} (${host})`,
    });

    return this.stripPassword(server);
  }

  async findAll(user: AuthUser) {
    // Scoping: SUPER_ADMIN semua, OWNER/TEKNISI hanya router miliknya
    const servers = await this.prisma.mikrotikServer.findMany({
      where: serverScopeWhere(user),
      orderBy: { createdAt: 'desc' },
    });
    return servers.map((s) => this.stripPassword(s));
  }

  async findOne(id: string, user: AuthUser) {
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id },
    });
    if (!server) {
      throw new NotFoundException(`Router dengan ID ${id} tidak ditemukan`);
    }
    assertOwnerAccess(user, server.ownerId);
    return this.stripPassword(server);
  }

  async update(id: string, updateServerDto: UpdateServerDto, user: AuthUser) {
    const current = await this.findOne(id, user);

    // Cek duplikat bila host ATAU port berubah. Sebelumnya hanya dicek saat host
    // diisi, sehingga mengubah port saja bisa membuat pasangan host+port kembar.
    if (updateServerDto.host || updateServerDto.port) {
      const nextHost = updateServerDto.host ?? current.host;
      const nextPort = updateServerDto.port ?? current.port;

      const existingServer = await this.prisma.mikrotikServer.findFirst({
        where: {
          host: nextHost,
          port: nextPort,
          // Scope per-owner: tanpa ini router milik owner LAIN dengan host sama
          // ikut memblokir, padahal antar tenant harus terisolasi.
          ownerId: current.ownerId,
          id: { not: id },
        },
      });
      if (existingServer) {
        throw new BadRequestException(
          `Router dengan host ${nextHost} port ${nextPort} sudah terdaftar`,
        );
      }
    }

    // Enkripsi password hanya jika benar-benar diisi (string kosong = tidak diubah).
    const data: Record<string, unknown> = { ...updateServerDto };
    if (data.password) {
      data.password = encryptSecret(data.password as string);
    } else {
      delete data.password;
    }

    const updated = await this.prisma.mikrotikServer.update({
      where: { id },
      data,
    });

    await this.activityLogService.logAction({
      action: 'SERVER_UPDATED',
      serverId: id,
      entity: 'MikrotikServer',
      entityId: id,
      detail: `Konfigurasi router diupdate: ${updated.name}`,
    });

    return this.stripPassword(updated);
  }

  async remove(id: string, user: AuthUser) {
    await this.findOne(id, user);
    return this.prisma.mikrotikServer.delete({
      where: { id },
    });
  }

  async testConnection(id: string, user: AuthUser) {
    // Baca row mentah (password masih terenkripsi) lalu dekripsi untuk dipakai.
    const server = await this.prisma.mikrotikServer.findUnique({ where: { id } });
    if (!server) {
      throw new NotFoundException(`Router dengan ID ${id} tidak ditemukan`);
    }
    assertOwnerAccess(user, server.ownerId);

    const result = await this.mikrotikService.testConnection(
      server.host,
      server.port,
      server.username,
      decryptSecret(server.password),
      server.useSSL,
    );

    const lastStatus = result.success ? 'ONLINE' : 'OFFLINE';

    // Update status di database secara background
    await this.prisma.mikrotikServer.update({
      where: { id },
      data: {
        lastStatus,
        lastCheckedAt: new Date(),
      },
    });

    if (!result.success) {
      await this.activityLogService.logAction({
        action: 'ROUTER_CONNECTION_FAILED',
        serverId: id,
        entity: 'MikrotikServer',
        entityId: id,
        detail: `Test koneksi gagal: ${result.error}`,
      });
    }

    return {
      serverId: id,
      success: result.success,
      latency: result.latency,
      error: result.error,
      lastStatus,
    };
  }

  async testCustomConnection(testConnectionDto: TestConnectionDto) {
    const { host, port, username, password, useSSL } = testConnectionDto;
    const defaultPort = port || (useSSL ? 443 : 80);

    const result = await this.mikrotikService.testConnection(
      host,
      defaultPort,
      username,
      password,
      useSSL ?? false,
    );

    return {
      success: result.success,
      latency: result.latency,
      error: result.error,
    };
  }

  /**
   * Refresh status koneksi SEMUA server sekaligus (untuk sinkronisasi terpusat).
   * Tes koneksi tiap server (password didekripsi), perbarui lastStatus + lastCheckedAt
   * di DB, lalu kembalikan daftar server terbaru (password di-strip).
   * Dipakai polling terpusat di frontend agar status tidak stale.
   */
  async refreshAllStatus(user: AuthUser) {
    // Scoping: hanya refresh router milik user (SUPER_ADMIN = semua)
    const servers = await this.prisma.mikrotikServer.findMany({
      where: serverScopeWhere(user),
    });

    // Tes koneksi semua server secara paralel
    await Promise.all(
      servers.map(async (server) => {
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
      }),
    );

    // Ambil ulang daftar terbaru (status sudah diperbarui)
    return this.findAll(user);
  }
}
