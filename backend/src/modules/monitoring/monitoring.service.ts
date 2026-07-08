/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MikrotikService } from '../mikrotik/mikrotik.service.js';
import { type AuthUser, assertOwnerAccess } from '../../common/scope.util.js';

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
  ) {}

  /**
   * Kegagalan koneksi/perintah ke router BUKAN error server kami → jangan biarkan
   * jadi 500 mentah (spam-kan dashboard yang polling tiap 3s). Bungkus jadi 502
   * (Bad Gateway): backend adalah gateway ke router yang sedang tak bisa dihubungi.
   */
  private routerUnreachable(serverId: string, context: string, error: any): never {
    const message = error?.message ?? String(error);
    this.logger.warn(`${context} gagal untuk server ${serverId}: ${message}`);
    throw new BadGatewayException(`${context}: router tidak dapat dihubungi`);
  }

  // ─── Mapper (raw RouterOS → bentuk yang dipakai frontend) ───────────────────
  private mapActiveUsers(activeRaw: any[]) {
    return activeRaw.map((u: any) => ({
      id: u['.id'] || u.id,
      username: u.user || 'Unknown',
      ipAddress: u.address || '-',
      macAddress: u['mac-address'] || '-',
      uptime: u.uptime || '-',
      bytesIn: u['bytes-in'] ? parseInt(u['bytes-in'], 10) : 0,
      bytesOut: u['bytes-out'] ? parseInt(u['bytes-out'], 10) : 0,
      sessionTimeLeft: u['session-time-left'] || null,
      idleTime: u['idle-time'] || null,
    }));
  }

  private mapResources(resources: any, serverId: string, serverName: string) {
    return {
      serverId,
      serverName,
      uptime: resources.uptime || 'Unknown',
      cpuLoad:
        resources['cpu-load'] !== undefined
          ? parseInt(resources['cpu-load'], 10)
          : 0,
      cpuCount: resources['cpu-count'] ? parseInt(resources['cpu-count'], 10) : 1,
      freeMemory: resources['free-memory'] ? parseInt(resources['free-memory'], 10) : 0,
      totalMemory: resources['total-memory'] ? parseInt(resources['total-memory'], 10) : 0,
      freeHddSpace: resources['free-hdd-space'] ? parseInt(resources['free-hdd-space'], 10) : 0,
      totalHddSpace: resources['total-hdd-space'] ? parseInt(resources['total-hdd-space'], 10) : 0,
      version: resources.version || 'Unknown',
      boardName: resources['board-name'] || 'Unknown',
      architectureName: resources['architecture-name'] || 'Unknown',
    };
  }

  private mapTraffic(interfacesRaw: any[]) {
    return interfacesRaw.map((iface: any) => ({
      id: iface['.id'] || iface.id,
      name: iface.name || 'Unknown',
      type: iface.type || 'Unknown',
      mtu: iface.mtu ? parseInt(iface.mtu, 10) : 0,
      macAddress: iface['mac-address'] || '-',
      rxByte: iface['rx-byte'] ? parseInt(iface['rx-byte'], 10) : 0,
      txByte: iface['tx-byte'] ? parseInt(iface['tx-byte'], 10) : 0,
      rxPacket: iface['rx-packet'] ? parseInt(iface['rx-packet'], 10) : 0,
      txPacket: iface['tx-packet'] ? parseInt(iface['tx-packet'], 10) : 0,
      running: iface.running === 'true' || iface.running === true,
      disabled: iface.disabled === 'true' || iface.disabled === true,
    }));
  }

  private async getServerOrThrow(serverId: string, user: AuthUser) {
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException(
        `Server MikroTik dengan ID "${serverId}" tidak ditemukan`,
      );
    }
    // Scoping: hanya boleh memantau router milik sendiri
    assertOwnerAccess(user, server.ownerId);
    return server;
  }

  /**
   * Snapshot monitoring (active + resources + traffic) dalam SATU koneksi router.
   * Optimasi: 1 login + 3 perintah, menggantikan 3 panggilan terpisah dari dashboard.
   */
  async getSnapshot(serverId: string, user: AuthUser) {
    const server = await this.getServerOrThrow(serverId, user);
    try {
      const snap = await this.mikrotikService.getMonitoringSnapshot(serverId);
      return {
        activeUsers: this.mapActiveUsers(snap.active),
        resources: this.mapResources(snap.resource, serverId, server.name),
        traffic: this.mapTraffic(snap.interfaces),
      };
    } catch (error: any) {
      this.routerUnreachable(serverId, 'Snapshot monitoring', error);
    }
  }

  /**
   * Mengambil daftar pengguna aktif di Hotspot secara real-time.
   */
  async getActiveUsers(serverId: string, user: AuthUser) {
    await this.getServerOrThrow(serverId, user);
    try {
      const activeRaw = await this.mikrotikService.getActiveUsers(serverId);
      return this.mapActiveUsers(activeRaw);
    } catch (error: any) {
      this.routerUnreachable(serverId, 'Pantau pengguna aktif', error);
    }
  }

  /**
   * Mengambil statistik pemakaian hardware / resource sistem dari router MikroTik secara real-time.
   */
  async getRouterResources(serverId: string, user: AuthUser) {
    const server = await this.getServerOrThrow(serverId, user);
    try {
      const resources = await this.mikrotikService.getSystemResource(serverId);
      return this.mapResources(resources, serverId, server.name);
    } catch (error: any) {
      this.routerUnreachable(serverId, 'Pantau resource hardware', error);
    }
  }

  /**
   * Mengambil statistik traffic dari semua interface router MikroTik secara real-time.
   */
  async getRouterTraffic(serverId: string, user: AuthUser) {
    await this.getServerOrThrow(serverId, user);
    try {
      const interfacesRaw = await this.mikrotikService.getInterfaces(serverId);
      return this.mapTraffic(interfacesRaw);
    } catch (error: any) {
      this.routerUnreachable(serverId, 'Pantau traffic', error);
    }
  }
}
