import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePlanDto } from './dto/create-plan.dto.js';
import { UpdatePlanDto } from './dto/update-plan.dto.js';

/**
 * Manajemen penuh paket langganan (khusus SUPER_ADMIN). Berbeda dari
 * `GET /billing/plans` yang hanya menampilkan paket aktif untuk owner.
 */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Semua paket, termasuk yang non-aktif (untuk panel SA). */
  async findAll() {
    return this.prisma.plan.findMany({ orderBy: { price: 'asc' } });
  }

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Paket tidak ditemukan');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    const existing = await this.prisma.plan.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Kode paket "${dto.code}" sudah dipakai`);
    }
    return this.prisma.plan.create({
      data: {
        code: dto.code,
        name: dto.name,
        price: dto.price,
        durationDays: dto.durationDays ?? null,
        maxRouters: dto.maxRouters,
        maxTeknisi: dto.maxTeknisi,
        aiAccess: dto.aiAccess,
        apiKeyAccess: dto.apiKeyAccess,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findOne(id);
    // Jika kode diubah, pastikan tidak bentrok dengan paket lain
    if (dto.code) {
      const clash = await this.prisma.plan.findUnique({
        where: { code: dto.code },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(`Kode paket "${dto.code}" sudah dipakai`);
      }
    }
    return this.prisma.plan.update({ where: { id }, data: dto });
  }

  /**
   * Hapus paket. Bila masih ada langganan/pembayaran yang memakainya →
   * soft-delete (set `isActive=false`) agar histori tetap utuh. Bila tak
   * dipakai sama sekali → hard-delete.
   */
  async remove(id: string) {
    const plan = await this.findOne(id);
    if (plan.code === 'FREE') {
      throw new BadRequestException('Paket FREE tidak boleh dihapus');
    }
    const [subs, pays] = await this.prisma.$transaction([
      this.prisma.subscription.count({ where: { planId: id } }),
      this.prisma.paymentTransaction.count({ where: { planId: id } }),
    ]);
    if (subs > 0 || pays > 0) {
      const updated = await this.prisma.plan.update({
        where: { id },
        data: { isActive: false },
      });
      return { softDeleted: true, plan: updated };
    }
    await this.prisma.plan.delete({ where: { id } });
    return { softDeleted: false };
  }
}
