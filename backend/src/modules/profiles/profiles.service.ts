/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MikrotikService } from '../mikrotik/mikrotik.service.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import {
  type AuthUser,
  serverScopeWhere,
  assertOwnerAccess,
} from '../../common/scope.util.js';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
  ) {}

  async create(createProfileDto: CreateProfileDto, user: AuthUser) {
    const {
      serverId,
      name,
      rateLimit,
      sessionTimeout,
      idleTimeout,
      sharedUsers,
      validity,
      description,
    } = createProfileDto;

    // Check if server exists
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException(
        `Router dengan ID ${serverId} tidak ditemukan`,
      );
    }
    assertOwnerAccess(user, server.ownerId);

    // Check unique name on this server
    const existing = await this.prisma.hotspotProfile.findUnique({
      where: {
        serverId_name: { serverId, name },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Profil dengan nama "${name}" sudah terdaftar pada router ini`,
      );
    }

    let syncedToRouter = false;
    try {
      // 1. Daftarkan di MikroTik CHR asli
      await this.mikrotikService.createHotspotProfile(
        serverId,
        name,
        rateLimit,
        sessionTimeout,
        idleTimeout,
        sharedUsers,
      );
      syncedToRouter = true;
    } catch (error: any) {
      // Kita log error tapi tetap simpan di DB sebagai syncedToRouter = false
      console.warn(
        `Gagal sinkronisasi profil "${name}" ke MikroTik:`,
        error.message || error,
      );
    }

    // 2. Simpan di Database
    return this.prisma.hotspotProfile.create({
      data: {
        serverId,
        name,
        rateLimit,
        sessionTimeout,
        idleTimeout,
        sharedUsers,
        validity,
        description,
        syncedToRouter,
      },
    });
  }

  async findAll(user: AuthUser, serverId?: string) {
    return this.prisma.hotspotProfile.findMany({
      // Scope owner + optional filter 1 router (cegah campur antar-router).
      where: { serverId, server: serverScopeWhere(user) },
      include: { server: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthUser) {
    const profile = await this.prisma.hotspotProfile.findUnique({
      where: { id },
      include: { server: true },
    });
    if (!profile) {
      throw new NotFoundException(
        `Profil Hotspot dengan ID ${id} tidak ditemukan`,
      );
    }
    assertOwnerAccess(user, profile.server.ownerId);
    return profile;
  }

  async update(id: string, updateProfileDto: UpdateProfileDto, user: AuthUser) {
    const profile = await this.findOne(id, user);
    const { name, rateLimit, sessionTimeout, idleTimeout, sharedUsers } =
      updateProfileDto;

    // Jika ganti nama, check uniqueness
    if (name && name !== profile.name) {
      const existing = await this.prisma.hotspotProfile.findUnique({
        where: {
          serverId_name: { serverId: profile.serverId, name },
        },
      });
      if (existing) {
        throw new BadRequestException(
          `Profil dengan nama "${name}" sudah terdaftar pada router ini`,
        );
      }
    }

    // Update di DB
    const updated = await this.prisma.hotspotProfile.update({
      where: { id },
      data: updateProfileDto,
    });

    // Sinkronisasi ke router: Hapus profile lama, buat yang baru!
    // Ini taktik paling aman di MikroTik daripada mem-patch
    try {
      await this.mikrotikService.removeHotspotProfile(
        profile.serverId,
        profile.name,
      );
      await this.mikrotikService.createHotspotProfile(
        profile.serverId,
        name || profile.name,
        rateLimit || profile.rateLimit,
        sessionTimeout !== undefined
          ? sessionTimeout
          : (profile.sessionTimeout ?? undefined),
        idleTimeout !== undefined
          ? idleTimeout
          : (profile.idleTimeout ?? undefined),
        sharedUsers !== undefined ? sharedUsers : profile.sharedUsers,
      );
      await this.prisma.hotspotProfile.update({
        where: { id },
        data: { syncedToRouter: true },
      });
    } catch (error: any) {
      console.warn(
        `Gagal sinkronisasi update profil ke MikroTik:`,
        error.message || error,
      );
      await this.prisma.hotspotProfile.update({
        where: { id },
        data: { syncedToRouter: false },
      });
    }

    return updated;
  }

  async remove(id: string, user: AuthUser) {
    const profile = await this.findOne(id, user);

    // Hapus di MikroTik router
    try {
      await this.mikrotikService.removeHotspotProfile(
        profile.serverId,
        profile.name,
      );
    } catch (error: any) {
      console.warn(
        `Gagal menghapus profil "${profile.name}" di MikroTik:`,
        error.message || error,
      );
    }

    // Hapus di DB
    return this.prisma.hotspotProfile.delete({
      where: { id },
    });
  }

  /**
   * Mengambil profile yang sudah ada di CHR dan menyimpannya ke database
   */
  async syncFromRouter(serverId: string, user: AuthUser) {
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException(
        `Router dengan ID ${serverId} tidak ditemukan`,
      );
    }
    assertOwnerAccess(user, server.ownerId);

    // 1. Ambil data dari MikroTik secara real-time (DI LUAR transaksi DB).
    //    usersFetchOk menandai apakah daftar user berhasil ditarik — penting agar
    //    blok penyelarasan voucher TIDAK menghapus data lokal saat fetch user gagal.
    const routerProfiles = await this.mikrotikService.getHotspotProfiles(serverId);
    let routerUsers: any[] = [];
    let routerActiveUsers: any[] = [];
    let usersFetchOk = false;
    try {
      routerUsers = await this.mikrotikService.getHotspotUsers(serverId);
      routerActiveUsers = await this.mikrotikService.getActiveUsers(serverId);
      usersFetchOk = true;
    } catch (e: any) {
      console.warn('Gagal mengambil hotspot users/active users dari router:', e.message || e);
    }

    const imported: any[] = [];
    let deletedProfilesCount = 0;
    let deletedVouchersCount = 0;
    let importedVouchersCount = 0;

    // Semua mutasi DB dibungkus dalam satu transaksi → atomik (gagal = rollback penuh,
    // tidak ada state separuh seperti bug sebelumnya).
    await this.prisma.$transaction(
      async (tx) => {
        // 2. PENYELARASAN PROFIL HOTSPOT
        const routerProfileNames = new Set(routerProfiles.map((rp: any) => rp.name));

        const dbProfiles = await tx.hotspotProfile.findMany({ where: { serverId } });

        for (const dbProfile of dbProfiles) {
          // Profil di DB yang tidak ada lagi di MikroTik → hapus beserta vouchernya
          if (!routerProfileNames.has(dbProfile.name)) {
            const delVouchers = await tx.voucher.deleteMany({
              where: { profileId: dbProfile.id },
            });
            deletedVouchersCount += delVouchers.count;
            await tx.hotspotProfile.delete({ where: { id: dbProfile.id } });
            deletedProfilesCount++;
          }
        }

        // Upsert profil dari MikroTik ke DB lokal
        for (const rProfile of routerProfiles) {
          const name = rProfile.name;
          const rateLimit = rProfile['rate-limit'] || '2M/2M';
          const sessionTimeout = rProfile['session-timeout'] || null;
          const idleTimeout = rProfile['idle-timeout'] || null;
          const sharedUsers = parseInt(rProfile['shared-users'] || '1', 10);

          const existing = await tx.hotspotProfile.findUnique({
            where: { serverId_name: { serverId, name } },
          });

          if (!existing) {
            const newProfile = await tx.hotspotProfile.create({
              data: {
                serverId,
                name,
                rateLimit,
                sessionTimeout,
                idleTimeout,
                sharedUsers,
                validity: '1d',
                syncedToRouter: true,
                description: 'Diimpor otomatis dari router MikroTik',
              },
            });
            imported.push(newProfile);
          } else {
            await tx.hotspotProfile.update({
              where: { id: existing.id },
              data: { rateLimit, sessionTimeout, idleTimeout, sharedUsers, syncedToRouter: true },
            });
          }
        }

        // 3. PENYELARASAN VOUCHER — HANYA jika daftar user berhasil ditarik.
        //    Tanpa guard ini, fetch user yang gagal (routerUsers=[]) akan menghapus
        //    SEMUA voucher lokal (bug "web kosong" di v6).
        if (routerProfiles.length > 0 && usersFetchOk) {
          const routerUsernames = new Set(routerUsers.map((ru: any) => ru.name));
          const activeUsernames = new Set(routerActiveUsers.map((au: any) => au.user));

          const dbVouchers = await tx.voucher.findMany({ where: { serverId } });

          // Hapus voucher lokal yang sudah tidak ada di router
          const vouchersToDelete = dbVouchers.filter(
            (v) => !routerUsernames.has(v.username),
          );
          if (vouchersToDelete.length > 0) {
            await tx.voucher.deleteMany({
              where: { id: { in: vouchersToDelete.map((v) => v.id) } },
            });
            deletedVouchersCount += vouchersToDelete.length;
          }

          // Map nama profil → ID profil lokal
          const localProfiles = await tx.hotspotProfile.findMany({ where: { serverId } });
          const profileMap = new Map<string, string>();
          for (const p of localProfiles) profileMap.set(p.name, p.id);

          // Upsert tiap user router (keyed pada username yang unique global).
          // upsert menghilangkan P2002: create jika baru, update jika sudah ada
          // (termasuk jika username dimiliki server lain → dipindahkan ke server ini).
          for (const rUser of routerUsers) {
            const isUsed =
              (rUser.uptime && rUser.uptime !== '0s') ||
              (rUser['bytes-in'] && parseInt(rUser['bytes-in']) > 0) ||
              (rUser['bytes-out'] && parseInt(rUser['bytes-out']) > 0) ||
              activeUsernames.has(rUser.name);

            const targetStatus = isUsed ? 'USED' : 'UNUSED';
            const profileName = rUser.profile || 'default';
            const localProfileId = profileMap.get(profileName);

            if (!localProfileId) {
              console.warn(
                `User ${rUser.name} menggunakan profil "${profileName}" yang tidak ada di lokal. Diabaikan.`,
              );
              continue;
            }

            await tx.voucher.upsert({
              where: { username: rUser.name },
              create: {
                serverId,
                profileId: localProfileId,
                username: rUser.name,
                password: rUser.password || '',
                status: targetStatus,
                batchId: 'sync-imported',
              },
              update: {
                serverId,
                profileId: localProfileId,
                status: targetStatus,
              },
            });
            importedVouchersCount++;
          }
        }
      },
      { timeout: 30000 },
    );

    // B9: sertakan daftar profil FINAL (setelah sync) agar frontend bisa langsung
    // setQueryData tanpa GET /profiles tambahan. Additive — ringkasan lama tetap ada.
    const profiles = await this.findAll(user, serverId);

    return {
      serverId,
      totalRouterProfiles: routerProfiles.length,
      importedCount: imported.length,
      deletedProfilesCount,
      deletedVouchersCount,
      importedVouchersCount,
      usersSynced: usersFetchOk,
      imported,
      profiles,
    };
  }
}
