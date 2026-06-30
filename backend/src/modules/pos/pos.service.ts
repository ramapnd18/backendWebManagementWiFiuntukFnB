import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  HotspotProfile,
  MikrotikServer,
  PosApiKey,
  Voucher,
} from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service.js';
import { MikrotikService } from '../mikrotik/mikrotik.service.js';
import { ActivityLogService } from '../activity-log/activity-log.service.js';
import { TriggerVoucherDto } from './dto/trigger-voucher.dto.js';
import { generateNumericCode } from './pos.util.js';

/**
 * Logika integrasi POS (lihat doc/POS_INTEGRATION.md §3 & §4).
 *
 * Prinsip:
 *  - Voucher dibuat BARU ke MikroTik saat ada trigger POS (bukan ambil stok lama).
 *  - 1 request POS = 1 voucher.
 *  - Idempoten via `transactionId`: replay request yang sama mengembalikan voucher
 *    yang sama (tanpa membuat baru).
 */
@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);
  private readonly codeLength: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
    private readonly activityLogService: ActivityLogService,
  ) {
    const parsed = parseInt(process.env.POS_VOUCHER_CODE_LENGTH ?? '6', 10);
    this.codeLength = Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
  }

  /**
   * Endpoint A — daftar paket WiFi pada server YANG TERIKAT ke API key.
   * Server diambil dari API key (per-outlet), POS tak perlu kirim serverId.
   * Hanya field aman yang dikirim (tanpa host/password mentah).
   */
  async listProfiles(posApiKey: PosApiKey) {
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: posApiKey.serverId },
      include: { profiles: { orderBy: { createdAt: 'asc' } } },
    });

    if (!server) {
      throw new NotFoundException(
        'Server yang terikat ke API key ini tidak ditemukan',
      );
    }

    // Bentuk response tetap { servers: [...] } agar kompatibel — hanya berisi 1 server (milik key).
    return {
      servers: [
        {
          serverId: server.id,
          serverName: server.name,
          profiles: server.profiles.map((p) => ({
            profileId: p.id,
            name: p.name,
            rateLimit: p.rateLimit,
            validity: p.validity,
            sharedUsers: p.sharedUsers,
          })),
        },
      ],
    };
  }

  /**
   * Endpoint B — trigger pembuatan voucher dari POS.
   * Server diambil dari API key (per-outlet). Bila body menyertakan `serverId`,
   * harus sama dengan server milik key — jika beda → 403 (cegah lintas-outlet).
   * @returns { isReplay, body } — isReplay=true → HTTP 200 (idempoten), else 201.
   */
  async triggerVoucher(dto: TriggerVoucherDto, posApiKey: PosApiKey) {
    const { transactionId, profileId, outletName, customerName } = dto;

    // Server target = server milik API key (sumber kebenaran).
    const serverId = posApiKey.serverId;

    // Bila POS tetap mengirim serverId, pastikan cocok dengan key (cegah salah outlet).
    if (dto.serverId && dto.serverId !== serverId) {
      throw new ForbiddenException(
        'API key ini tidak berhak mengakses server tersebut',
      );
    }

    // 1. Validasi server (milik key)
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException(
        `Server dengan ID ${serverId} tidak ditemukan`,
      );
    }

    // 2. Validasi profil & kepemilikan ke server tsb
    const profile = await this.prisma.hotspotProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile || profile.serverId !== serverId) {
      throw new NotFoundException(
        `Profil dengan ID ${profileId} tidak ditemukan pada server ini`,
      );
    }

    // 3. Idempotensi — transaksi sukses sebelumnya dikembalikan apa adanya
    const existingTx = await this.prisma.posTransaction.findUnique({
      where: { transactionId },
    });
    if (existingTx?.status === 'SUCCESS' && existingTx.voucherId) {
      const voucher = await this.prisma.voucher.findUnique({
        where: { id: existingTx.voucherId },
        include: { profile: true, server: true },
      });
      if (voucher) {
        return {
          isReplay: true,
          body: await this.buildResponse(
            transactionId,
            voucher,
            voucher.profile,
            voucher.server,
          ),
        };
      }
    }

    // 4. Generate username numerik unik (password = username)
    let username = '';
    let isUnique = false;
    while (!isUnique) {
      username = generateNumericCode(this.codeLength);
      const exists = await this.prisma.voucher.findUnique({
        where: { username },
      });
      if (!exists) isUnique = true;
    }
    const password = username;

    // 5. Buat user di MikroTik — gagal → catat FAILED, balas 502
    try {
      await this.mikrotikService.createHotspotUser(
        serverId,
        username,
        password,
        profile.name,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.prisma.posTransaction.upsert({
        where: { transactionId },
        create: {
          transactionId,
          posApiKeyId: posApiKey.id,
          serverId,
          profileId,
          status: 'FAILED',
          errorMessage: message,
          outletName,
          customerName,
        },
        update: {
          status: 'FAILED',
          errorMessage: message,
          voucherId: null,
        },
      });
      await this.activityLogService.logAction({
        action: 'POS_TRANSACTION_RECEIVED',
        serverId,
        entity: 'PosTransaction',
        entityId: transactionId,
        detail: `POS trigger GAGAL (router): ${message}`,
      });
      this.logger.warn(
        `Trigger voucher gagal untuk ${transactionId}: ${message}`,
      );
      throw new BadGatewayException('Router tidak dapat dijangkau, coba lagi');
    }

    // 6. Simpan voucher + transaksi (atomik)
    const voucher = await this.prisma.$transaction(async (tx) => {
      const created = await tx.voucher.create({
        data: {
          serverId,
          profileId,
          username,
          password,
          outletName,
          status: 'UNUSED',
        },
      });
      await tx.posTransaction.upsert({
        where: { transactionId },
        create: {
          transactionId,
          posApiKeyId: posApiKey.id,
          serverId,
          profileId,
          voucherId: created.id,
          status: 'SUCCESS',
          outletName,
          customerName,
        },
        update: {
          status: 'SUCCESS',
          errorMessage: null,
          voucherId: created.id,
          posApiKeyId: posApiKey.id,
          outletName,
          customerName,
        },
      });
      return created;
    });

    // 7. Catat log aktivitas
    await this.activityLogService.logAction({
      action: 'POS_VOUCHER_GENERATED',
      serverId,
      entity: 'Voucher',
      entityId: voucher.id,
      detail: `POS (${outletName ?? 'tanpa outlet'}) → voucher ${username} (Profile: ${profile.name}, TRX: ${transactionId})`,
    });

    // 8. Bangun response
    return {
      isReplay: false,
      body: await this.buildResponse(transactionId, voucher, profile, server),
    };
  }

  /** Bangun login URL + QR + instruksi untuk dicetak di struk. */
  private async buildResponse(
    transactionId: string,
    voucher: Voucher,
    profile: HotspotProfile,
    server: MikrotikServer,
  ) {
    const host = server.dnsName || server.host || 'wifi.net';
    const loginUrl = `http://${host}/login?username=${voucher.username}&password=${voucher.password}`;
    const qrBase64 = await QRCode.toDataURL(loginUrl);

    return {
      transactionId,
      voucher: {
        username: voucher.username,
        password: voucher.password,
        profileName: profile.name,
        rateLimit: profile.rateLimit,
        validity: profile.validity,
        loginUrl,
        qrBase64,
        instructions: `Sambungkan ke WiFi '${server.name}' → scan QR atau buka halaman login → masukkan username & password.`,
      },
    };
  }
}
