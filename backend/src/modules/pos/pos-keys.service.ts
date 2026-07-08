import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityLogService } from '../activity-log/activity-log.service.js';
import { generatePosApiKey, maskApiKey } from './pos.util.js';
import {
  assertOwnerAccess,
  serverScopeWhere,
  type AuthUser,
} from '../../common/scope.util.js';

/**
 * Pengelolaan API key POS (admin, terproteksi JWT).
 * Lihat doc/POS_INTEGRATION.md §2.
 *
 * Sejak revisi per-server: tiap API key TERIKAT ke 1 server (outlet). Key hanya
 * bisa melihat profil & trigger voucher pada server tersebut.
 */
@Injectable()
export class PosKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  /**
   * Buat API key baru untuk satu server. Mengembalikan key MENTAH hanya sekali —
   * DB hanya menyimpan hash SHA-256-nya.
   */
  async create(label: string, serverId: string, user: AuthUser) {
    // Validasi server tujuan ada
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new BadRequestException(
        `Server dengan ID "${serverId}" tidak ditemukan`,
      );
    }
    // Cegah buat key untuk router milik owner lain
    assertOwnerAccess(user, server.ownerId);

    const { rawKey, keyHash, prefix } = generatePosApiKey();

    const apiKey = await this.prisma.posApiKey.create({
      data: { label, serverId, keyHash, prefix },
    });

    await this.activityLogService.logAction({
      action: 'POS_TRANSACTION_RECEIVED',
      serverId,
      entity: 'PosApiKey',
      entityId: apiKey.id,
      detail: `API key POS dibuat untuk outlet "${label}" (server: ${server.name})`,
    });

    return {
      id: apiKey.id,
      label: apiKey.label,
      serverId: apiKey.serverId,
      serverName: server.name,
      key: rawKey, // ← hanya tampil sekali, admin wajib menyalin
      createdAt: apiKey.createdAt,
      message:
        'Simpan key ini sekarang. Key mentah TIDAK akan ditampilkan lagi.',
    };
  }

  /**
   * List API key (ter-mask, tanpa hash) + info server terikat.
   * Di-scope ke server milik owner user; opsional filter 1 serverId.
   */
  async findAll(user: AuthUser, serverId?: string) {
    const keys = await this.prisma.posApiKey.findMany({
      where: { serverId, server: serverScopeWhere(user) },
      orderBy: { createdAt: 'desc' },
      include: { server: { select: { id: true, name: true } } },
    });

    return keys.map((k) => ({
      id: k.id,
      label: k.label,
      serverId: k.serverId,
      serverName: k.server?.name ?? '—',
      maskedKey: maskApiKey(k.prefix),
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    }));
  }

  /** Aktifkan / nonaktifkan API key. */
  async setActive(id: string, isActive: boolean, user: AuthUser) {
    await this.ensureExists(id, user);

    const updated = await this.prisma.posApiKey.update({
      where: { id },
      data: { isActive },
      include: { server: { select: { name: true } } },
    });

    return {
      id: updated.id,
      label: updated.label,
      serverId: updated.serverId,
      serverName: updated.server?.name ?? '—',
      maskedKey: maskApiKey(updated.prefix),
      isActive: updated.isActive,
      lastUsedAt: updated.lastUsedAt,
      createdAt: updated.createdAt,
    };
  }

  /** Hapus (revoke permanen) API key. */
  async remove(id: string, user: AuthUser) {
    await this.ensureExists(id, user);
    await this.prisma.posApiKey.delete({ where: { id } });
    return { message: 'API key berhasil dihapus' };
  }

  /**
   * Pastikan key ada DAN milik owner user (cek via server terikat).
   * Cegah user tenant lain revoke/nonaktifkan key outlet orang.
   */
  private async ensureExists(id: string, user: AuthUser) {
    const existing = await this.prisma.posApiKey.findUnique({
      where: { id },
      include: { server: { select: { ownerId: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`API key dengan ID ${id} tidak ditemukan`);
    }
    assertOwnerAccess(user, existing.server.ownerId);
    return existing;
  }
}
