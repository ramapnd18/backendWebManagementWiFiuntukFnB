import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LogAction } from '@prisma/client';
import { type AuthUser, serverScopeWhere } from '../../common/scope.util.js';

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
    if (action) whereClause.action = action;
    // Scoping: OWNER/TEKNISI hanya log dari router miliknya (server scope).
    // SUPER_ADMIN tanpa filter (termasuk log sistem tanpa server).
    if (user.role !== 'SUPER_ADMIN') {
      whereClause.server = serverScopeWhere(user);
    }

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
