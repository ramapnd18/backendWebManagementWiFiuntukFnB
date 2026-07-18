import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { ListOwnersDto } from './dto/list-owners.dto.js';

/**
 * Panel SUPER_ADMIN untuk mengelola Owner (tenant). Menyediakan daftar
 * beragregat (jumlah teknisi/router/transaksi POS + paket) dan detail owner.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  /** Daftar Owner + agregat. Return { data, meta:{ total, skip, take } }. */
  async listOwners(params: ListOwnersDto = {}) {
    const { skip = 0, take = 10, search, planCode } = params;

    const where: Prisma.UserWhereInput = { role: 'OWNER' };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (planCode) {
      where.subscriptions = {
        some: {
          status: 'ACTIVE',
          OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
          plan: { code: planCode },
        },
      };
    }

    const [owners, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          _count: { select: { technicians: true, servers: true } },
          subscriptions: {
            where: {
              status: 'ACTIVE',
              OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
            },
            include: { plan: { select: { code: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: Number(skip),
        take: Number(take),
      }),
      this.prisma.user.count({ where }),
    ]);

    // Jumlah transaksi POS per owner (via server → ownerId). Ukuran halaman kecil.
    const data = await Promise.all(
      owners.map(async (o) => {
        const posCount = await this.prisma.posTransaction.count({
          where: { server: { ownerId: o.id } },
        });
        const plan = o.subscriptions[0]?.plan ?? null;
        return {
          id: o.id,
          name: o.name,
          email: o.email,
          plan,
          teknisiCount: o._count.technicians,
          routerCount: o._count.servers,
          posCount,
          createdAt: o.createdAt,
        };
      }),
    );

    return { data, meta: { total, skip: Number(skip), take: Number(take) } };
  }

  /** Detail owner: langganan, kuota terpakai, ringkasan monitoring outlet. */
  async getOwnerDetail(id: string) {
    const owner = await this.prisma.user.findFirst({
      where: { id, role: 'OWNER' },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    if (!owner) throw new NotFoundException('Owner tidak ditemukan');

    const [limit, subscription, routerUsed, teknisiUsed, servers] =
      await Promise.all([
        this.billingService.getEffectiveLimit(id),
        this.billingService.getActiveSubscription(id),
        this.prisma.mikrotikServer.count({ where: { ownerId: id } }),
        this.prisma.user.count({ where: { ownerId: id, role: 'TEKNISI' } }),
        this.prisma.mikrotikServer.findMany({
          where: { ownerId: id },
          select: {
            id: true,
            name: true,
            lastStatus: true,
            lastCheckedAt: true,
          },
        }),
      ]);

    return {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      createdAt: owner.createdAt,
      subscription: subscription
        ? {
            plan: {
              code: subscription.plan.code,
              name: subscription.plan.name,
              price: subscription.plan.price,
              durationDays: subscription.plan.durationDays,
              maxRouters: subscription.plan.maxRouters,
              maxTeknisi: subscription.plan.maxTeknisi,
              aiAccess: subscription.plan.aiAccess,
              apiKeyAccess: subscription.plan.apiKeyAccess,
            },
            status: subscription.status,
            startedAt: subscription.startedAt,
            expiredAt: subscription.expiredAt,
          }
        : null,
      usage: {
        routers: { used: routerUsed, max: limit.maxRouters },
        teknisi: { used: teknisiUsed, max: limit.maxTeknisi },
        aiAccess: limit.aiAccess,
        apiKeyAccess: limit.apiKeyAccess,
      },
      monitoring: {
        outlets: servers.map((s) => ({
          serverId: s.id,
          name: s.name,
          lastStatus: s.lastStatus,
          lastCheckedAt: s.lastCheckedAt,
        })),
      },
    };
  }
}
