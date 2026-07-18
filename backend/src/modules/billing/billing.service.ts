import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityLogService } from '../activity-log/activity-log.service.js';
import { DuitkuService } from './duitku.service.js';
import { type AuthUser, effectiveOwnerId } from '../../common/scope.util.js';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly duitku: DuitkuService,
    private readonly activityLog: ActivityLogService,
  ) {}

  /** Daftar paket aktif (termurah dulu). */
  async getPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  /** Langganan AKTIF & belum kadaluarsa milik user (Owner). */
  async getActiveSubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }],
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Batas efektif Owner. Jika tak punya langganan aktif → fallback paket FREE.
   */
  async getEffectiveLimit(ownerId: string): Promise<{
    maxRouters: number;
    maxTeknisi: number;
    aiAccess: boolean;
    apiKeyAccess: boolean;
    expiredAt: Date | null;
    planCode: string;
    planName: string;
    expired: boolean;
    expiredPlanName: string | null;
  }> {
    // 1) Ada langganan aktif & belum kadaluarsa → pakai itu
    const sub = await this.getActiveSubscription(ownerId);
    if (sub) {
      return {
        maxRouters: sub.plan.maxRouters,
        maxTeknisi: sub.plan.maxTeknisi,
        aiAccess: sub.plan.aiAccess,
        apiKeyAccess: sub.plan.apiKeyAccess,
        expiredAt: sub.expiredAt,
        planCode: sub.plan.code,
        planName: sub.plan.name,
        expired: false,
        expiredPlanName: null,
      };
    }

    // 2) Tidak ada yang aktif → cek apakah ada langganan BERBAYAR yang baru kadaluarsa
    const lapsed = await this.prisma.subscription.findFirst({
      where: { userId: ownerId, status: 'ACTIVE', expiredAt: { lte: new Date() } },
      include: { plan: true },
      orderBy: { expiredAt: 'desc' },
    });
    const isExpired = !!lapsed && lapsed.plan.code !== 'FREE';

    // 3) Batas turun ke paket FREE; tandai expired bila paket berbayar lewat masa berlaku
    const free = await this.prisma.plan.findUnique({ where: { code: 'FREE' } });
    return {
      maxRouters: free?.maxRouters ?? 1,
      maxTeknisi: free?.maxTeknisi ?? 0,
      aiAccess: free?.aiAccess ?? false,
      apiKeyAccess: free?.apiKeyAccess ?? false,
      expiredAt: isExpired ? (lapsed?.expiredAt ?? null) : null,
      planCode: 'FREE',
      planName: free?.name ?? 'Gratis',
      expired: isExpired,
      expiredPlanName: isExpired ? (lapsed?.plan.name ?? null) : null,
    };
  }

  /**
   * Validasi kuota saat menambah router. Dipanggil dari ServersService.create.
   * Tolak bila langganan kadaluarsa atau jumlah router sudah mencapai batas.
   */
  async assertCanAddRouter(ownerId: string): Promise<void> {
    const limit = await this.getEffectiveLimit(ownerId);

    // Langganan berbayar kadaluarsa → tolak eksplisit (minta perpanjang)
    if (limit.expired) {
      const tgl = limit.expiredAt
        ? new Date(limit.expiredAt).toLocaleDateString('id-ID')
        : '-';
      throw new ForbiddenException(
        `Langganan ${limit.expiredPlanName} Anda sudah kadaluarsa (${tgl}). Perpanjang paket untuk menambah router.`,
      );
    }

    const count = await this.prisma.mikrotikServer.count({ where: { ownerId } });
    if (count >= limit.maxRouters) {
      throw new ForbiddenException(
        `Kuota router penuh (${count}/${limit.maxRouters}). Upgrade paket untuk menambah router.`,
      );
    }
  }

  /**
   * Validasi kuota saat menambah teknisi. Dipanggil dari UsersService.create.
   * Tolak bila langganan kadaluarsa atau jumlah teknisi sudah mencapai batas.
   */
  async assertCanAddTeknisi(ownerId: string): Promise<void> {
    const limit = await this.getEffectiveLimit(ownerId);

    if (limit.expired) {
      const tgl = limit.expiredAt
        ? new Date(limit.expiredAt).toLocaleDateString('id-ID')
        : '-';
      throw new ForbiddenException(
        `Langganan ${limit.expiredPlanName} Anda sudah kadaluarsa (${tgl}). Perpanjang paket untuk menambah teknisi.`,
      );
    }

    const count = await this.prisma.user.count({
      where: { ownerId, role: 'TEKNISI' },
    });
    if (count >= limit.maxTeknisi) {
      throw new ForbiddenException(
        `Kuota teknisi penuh (${count}/${limit.maxTeknisi}). Upgrade paket untuk menambah teknisi.`,
      );
    }
  }

  /**
   * Pastikan Owner punya akses fitur (aiAccess / apiKeyAccess) sesuai paket.
   * Dipakai guard/service AI & POS API key. Lempar 403 bila tidak diizinkan.
   */
  async assertFeatureAccess(
    ownerId: string,
    feature: 'aiAccess' | 'apiKeyAccess',
  ): Promise<void> {
    const limit = await this.getEffectiveLimit(ownerId);
    if (!limit[feature]) {
      const label =
        feature === 'aiAccess' ? 'fitur AI' : 'pembuatan POS API key';
      throw new ForbiddenException(
        `Paket ${limit.planName} Anda tidak termasuk ${label}. Upgrade paket untuk mengaksesnya.`,
      );
    }
  }

  /** Status langganan + pemakaian kuota untuk Owner/Teknisi. */
  async getMyStatus(user: AuthUser) {
    const ownerId = effectiveOwnerId(user); // OWNER → dirinya; TEKNISI → Owner-nya
    const limit = await this.getEffectiveLimit(ownerId);
    const [used, teknisiUsed] = await Promise.all([
      this.prisma.mikrotikServer.count({ where: { ownerId } }),
      this.prisma.user.count({ where: { ownerId, role: 'TEKNISI' } }),
    ]);
    const subscription = await this.getActiveSubscription(ownerId);
    return {
      plan: {
        code: limit.planCode,
        name: limit.planName,
        maxRouters: limit.maxRouters,
        maxTeknisi: limit.maxTeknisi,
        aiAccess: limit.aiAccess,
        apiKeyAccess: limit.apiKeyAccess,
      },
      // Field lama dipertahankan agar FE lama tak pecah (backward-compat).
      maxRouters: limit.maxRouters,
      used,
      remaining: Math.max(0, limit.maxRouters - used),
      expiredAt: limit.expiredAt,
      expired: limit.expired,
      expiredPlanName: limit.expiredPlanName,
      usage: {
        routers: { used, max: limit.maxRouters },
        teknisi: { used: teknisiUsed, max: limit.maxTeknisi },
        aiAccess: limit.aiAccess,
        apiKeyAccess: limit.apiKeyAccess,
      },
      subscription,
    };
  }

  /** Riwayat invoice (PaymentTransaction) milik Owner. Return { data, meta }. */
  async getInvoices(user: AuthUser, skip = 0, take = 10) {
    const userId = effectiveOwnerId(user);
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.paymentTransaction.findMany({
        where,
        include: { plan: { select: { code: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: Number(skip),
        take: Number(take),
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);

    return {
      data: rows.map((tx) => ({
        id: tx.id,
        merchantOrderId: tx.merchantOrderId,
        plan: tx.plan,
        amount: tx.amount,
        status: tx.status,
        paymentMethod: tx.paymentMethod,
        paidAt: tx.paidAt,
        createdAt: tx.createdAt,
        paymentUrl: tx.paymentUrl,
      })),
      meta: { total, skip: Number(skip), take: Number(take) },
    };
  }

  /** Pastikan user (Owner baru) punya langganan Free — idempoten. */
  async ensureFreeSubscription(userId: string) {
    const existing = await this.prisma.subscription.findFirst({
      where: { userId },
    });
    if (existing) return existing;
    const free = await this.prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!free) return null;
    return this.prisma.subscription.create({
      data: { userId, planId: free.id, status: 'ACTIVE', expiredAt: null },
    });
  }

  /** Buat checkout upgrade paket via Duitku → kembalikan paymentUrl. */
  async checkout(user: AuthUser, planCode: string) {
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Hanya Owner yang dapat membeli/upgrade paket');
    }

    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException(`Paket "${planCode}" tidak ditemukan`);
    }
    if (plan.price <= 0) {
      throw new BadRequestException('Paket gratis tidak memerlukan pembayaran');
    }

    const merchantOrderId = `SUB-${user.id.slice(-6)}-${Date.now()}`;
    const owner = await this.prisma.user.findUnique({ where: { id: user.id } });

    const { paymentUrl, reference } = await this.duitku.createInvoice({
      merchantOrderId,
      amount: plan.price,
      productDetails: `Langganan ${plan.name} (maks ${plan.maxRouters} router)`,
      email: owner?.email ?? 'owner@example.com',
      customerName: owner?.name ?? 'Owner',
    });

    const tx = await this.prisma.paymentTransaction.create({
      data: {
        merchantOrderId,
        userId: user.id,
        planId: plan.id,
        amount: plan.price,
        status: 'PENDING',
        duitkuReference: reference,
        paymentUrl,
      },
    });

    await this.activityLog.logAction({
      action: 'PAYMENT_INITIATED',
      userId: user.id,
      entity: 'PaymentTransaction',
      entityId: tx.id,
      detail: `Checkout paket ${plan.name} (Rp${plan.price})`,
    });

    return {
      merchantOrderId,
      reference,
      paymentUrl,
      amount: plan.price,
      plan: plan.name,
    };
  }

  /**
   * Tangani callback (webhook) Duitku. Validasi signature → idempoten →
   * set PAID → aktifkan/perpanjang langganan (set expiredAt + batas router).
   */
  async handleCallback(body: Record<string, any>) {
    const valid = this.duitku.verifyCallbackSignature({
      merchantCode: body.merchantCode,
      amount: body.amount,
      merchantOrderId: body.merchantOrderId,
      signature: body.signature,
    });
    if (!valid) {
      this.logger.warn(
        `Callback Duitku SIGNATURE INVALID utk order ${body.merchantOrderId}`,
      );
      throw new ForbiddenException('Signature callback tidak valid');
    }

    const tx = await this.prisma.paymentTransaction.findUnique({
      where: { merchantOrderId: body.merchantOrderId },
      include: { plan: true },
    });
    if (!tx) {
      this.logger.warn(`Callback utk order tak dikenal: ${body.merchantOrderId}`);
      return { received: true };
    }

    // Idempotensi: jika sudah PAID, jangan proses ulang
    if (tx.status === 'PAID') {
      return { received: true, idempotent: true };
    }

    const success = body.resultCode === '00' || body.resultCode === '0';
    if (!success) {
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { status: 'FAILED' },
      });
      await this.activityLog.logAction({
        action: 'PAYMENT_FAILED',
        userId: tx.userId,
        entity: 'PaymentTransaction',
        entityId: tx.id,
        detail: `Pembayaran gagal (resultCode ${body.resultCode})`,
      });
      return { received: true };
    }

    // Sukses → PAID + aktifkan langganan baru (atomik)
    const days = tx.plan.durationDays ?? 30;
    const expiredAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (db) => {
      await db.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentMethod: body.paymentCode ?? null,
        },
      });
      // Akhiri langganan aktif lama, buat yang baru
      await db.subscription.updateMany({
        where: { userId: tx.userId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
      await db.subscription.create({
        data: {
          userId: tx.userId,
          planId: tx.planId,
          status: 'ACTIVE',
          startedAt: new Date(),
          expiredAt,
        },
      });
    });

    await this.activityLog.logAction({
      action: 'PAYMENT_RECEIVED',
      userId: tx.userId,
      entity: 'PaymentTransaction',
      entityId: tx.id,
      detail: `Pembayaran PAID paket ${tx.plan.name} (Rp${tx.amount})`,
    });
    await this.activityLog.logAction({
      action: 'SUBSCRIPTION_ACTIVATED',
      userId: tx.userId,
      entity: 'Subscription',
      detail: `Langganan ${tx.plan.name} aktif s/d ${expiredAt.toISOString()}`,
    });

    return { received: true };
  }
}
