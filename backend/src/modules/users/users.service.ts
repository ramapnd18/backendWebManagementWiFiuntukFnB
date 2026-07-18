import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { type AuthUser } from '../../common/scope.util.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

// Field aman yang dikembalikan ke klien (tanpa password)
const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  ownerId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Buat user baru.
   * - OWNER: hanya boleh membuat TEKNISI; role dipaksa TEKNISI & ownerId = dirinya.
   * - SUPER_ADMIN: membuat OWNER atau TEKNISI. TEKNISI wajib ownerId (harus user OWNER).
   */
  async create(dto: CreateUserDto, requester: AuthUser) {
    let role: Role;
    let ownerId: string | null;

    if (requester.role === 'OWNER') {
      // Owner hanya bikin Teknisi miliknya — abaikan input role/ownerId (cegah escalation)
      role = 'TEKNISI';
      ownerId = requester.id;
    } else {
      // SUPER_ADMIN
      if (!dto.role || (dto.role !== 'OWNER' && dto.role !== 'TEKNISI')) {
        throw new BadRequestException(
          'Role wajib OWNER atau TEKNISI (SUPER_ADMIN tidak dapat dibuat via API)',
        );
      }
      role = dto.role;
      if (role === 'TEKNISI') {
        if (!dto.ownerId) {
          throw new BadRequestException('ownerId wajib diisi untuk role TEKNISI');
        }
        const owner = await this.prisma.user.findUnique({
          where: { id: dto.ownerId },
        });
        if (!owner || owner.role !== 'OWNER') {
          throw new BadRequestException('ownerId harus menunjuk user dengan role OWNER');
        }
        ownerId = owner.id;
      } else {
        ownerId = null; // OWNER adalah akar tenant
      }
    }

    // Kuota teknisi per paket langganan Owner (tolak bila penuh / langganan kadaluarsa)
    if (role === 'TEKNISI' && ownerId) {
      await this.billingService.assertCanAddTeknisi(ownerId);
    }

    const hashed = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email, password: hashed, name: dto.name, role, ownerId },
        select: SAFE_SELECT,
      });
      // Owner baru otomatis dapat langganan Gratis (kuota 1 router)
      if (role === 'OWNER') {
        await this.billingService.ensureFreeSubscription(user.id);
      }
      return user;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException(`Email ${dto.email} sudah terdaftar`);
      }
      throw e;
    }
  }

  /**
   * Daftar user.
   * - SUPER_ADMIN: semua (opsional filter role).
   * - OWNER: hanya Teknisi miliknya.
   */
  async findAll(requester: AuthUser, role?: Role) {
    const where: { ownerId?: string; role?: Role } = {};
    if (requester.role === 'OWNER') {
      where.ownerId = requester.id;
    }
    if (role) where.role = role;

    return this.prisma.user.findMany({
      where,
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Detail user dengan penegakan akses.
   * OWNER hanya boleh melihat Teknisi miliknya atau dirinya sendiri.
   */
  async findOne(id: string, requester: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_SELECT,
    });
    if (!user) {
      throw new NotFoundException(`User dengan ID ${id} tidak ditemukan`);
    }
    if (requester.role === 'OWNER') {
      const isOwnTeknisi = user.ownerId === requester.id;
      const isSelf = user.id === requester.id;
      if (!isOwnTeknisi && !isSelf) {
        throw new ForbiddenException('Anda tidak punya akses ke user ini');
      }
    }
    return user;
  }

  /**
   * Update (nama / password / aktif-nonaktif). Tidak mengubah role/ownerId.
   */
  async update(id: string, dto: UpdateUserDto, requester: AuthUser) {
    await this.findOne(id, requester); // cek akses + keberadaan

    if (dto.isActive === false && id === requester.id) {
      throw new BadRequestException('Anda tidak dapat menonaktifkan akun sendiri');
    }

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) data.password = await bcrypt.hash(dto.password, 12);

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: SAFE_SELECT,
    });
    return updated;
  }

  /**
   * Hapus user. OWNER hanya boleh menghapus Teknisi miliknya.
   * Hapus OWNER (oleh SUPER_ADMIN) cascade ke Teknisi + router-nya.
   */
  async remove(id: string, requester: AuthUser) {
    await this.findOne(id, requester);
    if (id === requester.id) {
      throw new BadRequestException('Anda tidak dapat menghapus akun sendiri');
    }
    await this.prisma.user.delete({ where: { id } });
    return { success: true, message: 'User berhasil dihapus' };
  }
}
