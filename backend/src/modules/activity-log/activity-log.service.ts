import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LogAction } from '@prisma/client';
import { type AuthUser, serverScopeWhere } from '../../common/scope.util.js';

/**
 * Aksi yang tergolong "riwayat koneksi router" — dipisahkan dari riwayat
 * aktivitas umum. Satu sumber kebenaran dipakai oleh kedua endpoint.
 */
export const CONNECTION_ACTIONS: LogAction[] = ['ROUTER_CONNECTION_FAILED'];

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Merekam aktivitas baru ke database
   */
  async logAction(data: {
    action: LogAction;
    userId?: string;
    serverId?: string;
    entity?: string;
    entityId?: string;
    detail?: string;
    ipAddress?: string;
  }) {
    try {
      await this.prisma.activityLog.create({
        data: {
          action: data.action,
          userId: data.userId,
          serverId: data.serverId,
          entity: data.entity,
          entityId: data.entityId,
          detail: data.detail,
          ipAddress: data.ipAddress,
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to write activity log for ${data.action}: ${error.message}`);
    }
  }

  /**
   * Mengambil daftar log aktivitas dengan pagination dan filter
   */
  async getLogs(
    params: {
      skip?: number;
      take?: number;
      serverId?: string;
      action?: LogAction;
    },
    user: AuthUser,
  ) {
    const { skip = 0, take = 50, serverId, action } = params;

    const whereClause: any = {};
    if (serverId) whereClause.serverId = serverId;
    if (action) {
      // Filter aksi spesifik dihormati apa adanya.
      whereClause.action = action;
    } else {
      // Default: kecualikan aksi koneksi router (kini punya endpoint sendiri).
      whereClause.action = { notIn: CONNECTION_ACTIONS };
    }
    // Scoping: OWNER/TEKNISI hanya log dari router miliknya (server scope).
    // SUPER_ADMIN tanpa filter (termasuk log sistem tanpa server).
    if (user.role !== 'SUPER_ADMIN') {
      whereClause.server = serverScopeWhere(user);
    }

    return this.queryLogs(whereClause, skip, take);
  }

  /**
   * Riwayat koneksi router (mis. router offline/gagal terhubung) — terpisah dari
   * riwayat aktivitas umum. Scoping & bentuk respons identik dengan getLogs.
   */
  async getRouterConnectionLogs(
    params: { skip?: number; take?: number; serverId?: string },
    user: AuthUser,
  ) {
    const { skip = 0, take = 50, serverId } = params;

    const whereClause: any = { action: { in: CONNECTION_ACTIONS } };
    if (serverId) whereClause.serverId = serverId;
    if (user.role !== 'SUPER_ADMIN') {
      whereClause.server = serverScopeWhere(user);
    }

    return this.queryLogs(whereClause, skip, take);
  }

  /** Query bersama untuk kedua endpoint riwayat (pagination + include seragam). */
  private async queryLogs(whereClause: any, skip: number, take: number) {
    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: whereClause,
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          server: { select: { id: true, name: true, host: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: Number(skip),
        take: Number(take),
      }),
      this.prisma.activityLog.count({ where: whereClause }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        skip: Number(skip),
        take: Number(take),
      },
    };
  }
}
