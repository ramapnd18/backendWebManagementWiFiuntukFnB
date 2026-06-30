/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MikrotikService } from '../mikrotik/mikrotik.service.js';
import { VoucherQueueService } from './voucher-queue.service.js';
import { ActivityLogService } from '../activity-log/activity-log.service.js';
import { GenerateSingleDto } from './dto/generate-single.dto.js';
import { GenerateBatchDto } from './dto/generate-batch.dto.js';
import {
  type AuthUser,
  serverScopeWhere,
  assertOwnerAccess,
} from '../../common/scope.util.js';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

function generateRandomCode(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Menghindari O, I, 1, 0
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
    private readonly queueService: VoucherQueueService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async generateSingle(dto: GenerateSingleDto, user: AuthUser) {
    const { serverId, profileId, outletName, username, password } = dto;

    // 1. Cek router
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException(
        `Router dengan ID ${serverId} tidak ditemukan`,
      );
    }
    assertOwnerAccess(user, server.ownerId);

    // 2. Cek profil
    const profile = await this.prisma.hotspotProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException(
        `Profil hotspot dengan ID ${profileId} tidak ditemukan`,
      );
    }

    // 3. Tentukan username & password
    let finalUsername = username || '';
    if (!finalUsername) {
      let isUnique = false;
      while (!isUnique) {
        finalUsername = generateRandomCode(6);
        const existing = await this.prisma.voucher.findUnique({
          where: { username: finalUsername },
        });
        if (!existing) isUnique = true;
      }
    } else {
      const existing = await this.prisma.voucher.findUnique({
        where: { username: finalUsername },
      });
      if (existing) {
        throw new BadRequestException(
          `Username "${finalUsername}" sudah terdaftar`,
        );
      }
    }

    const finalPassword = password || finalUsername;

    // 4. Daftarkan di MikroTik CHR asli
    await this.mikrotikService.createHotspotUser(
      serverId,
      finalUsername,
      finalPassword,
      profile.name,
    );

    // 5. Simpan di database
    const voucher = await this.prisma.voucher.create({
      data: {
        serverId,
        profileId,
        username: finalUsername,
        password: finalPassword,
        outletName,
        status: 'UNUSED',
      },
      include: { profile: true },
    });

    // 6. Catat Log
    await this.activityLogService.logAction({
      action: 'VOUCHER_CREATED',
      serverId,
      entity: 'Voucher',
      entityId: voucher.id,
      detail: `Dibuat manual: ${finalUsername} (Profile: ${profile.name})`,
    });

    return voucher;
  }

  async generateBatch(dto: GenerateBatchDto, user: AuthUser) {
    const {
      serverId,
      profileId,
      count,
      usernamePrefix,
      charLength,
      charFormat,
      outletName,
    } = dto;

    // 1. Cek router
    const server = await this.prisma.mikrotikServer.findUnique({
      where: { id: serverId },
    });
    if (!server) {
      throw new NotFoundException(
        `Router dengan ID ${serverId} tidak ditemukan`,
      );
    }
    assertOwnerAccess(user, server.ownerId);

    // 2. Cek profil
    const profile = await this.prisma.hotspotProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException(
        `Profil hotspot dengan ID ${profileId} tidak ditemukan`,
      );
    }

    // 3. Buat Batch ID unik
    const batchId = `BATCH-${Date.now()}-${generateRandomCode(3)}`;

    // 4. Kirim job ke BullMQ Queue
    await this.queueService.addJob({
      serverId,
      profileId,
      count,
      usernamePrefix,
      charLength,
      charFormat,
      outletName,
      batchId,
    });

    // 5. Catat Log
    await this.activityLogService.logAction({
      action: 'VOUCHER_BATCH_CREATED',
      serverId,
      entity: 'VoucherBatch',
      entityId: batchId,
      detail: `Memulai pembuatan batch ${count} voucher (Profile: ${profile.name})`,
    });

    return {
      message: `Pembuatan batch ${count} voucher sedang diproses di background`,
      batchId,
      status: 'PENDING',
    };
  }

  async findAll(user: AuthUser) {
    return this.prisma.voucher.findMany({
      where: { server: serverScopeWhere(user) },
      include: {
        profile: { select: { name: true, rateLimit: true, validity: true } },
        server: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthUser) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id },
      include: { profile: true, server: true },
    });
    if (!voucher) {
      throw new NotFoundException(`Voucher dengan ID ${id} tidak ditemukan`);
    }
    assertOwnerAccess(user, voucher.server.ownerId);
    return voucher;
  }

  /** Ambil voucher TANPA scoping — khusus generate PDF publik (struk/browser). */
  private async findOneForPdf(id: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id },
      include: { profile: true, server: true },
    });
    if (!voucher) {
      throw new NotFoundException(`Voucher dengan ID ${id} tidak ditemukan`);
    }
    return voucher;
  }

  async generatePdf(vouchers: any[]): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 20, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) =>
        reject(err instanceof Error ? err : new Error(String(err))),
      );

      // Desain Grid Kartu Voucher (A4: 595 x 842 pt)
      const cardWidth = 175;
      const cardHeight = 98;
      const cardsPerRow = 3;
      const cardsPerPage = 21; // 3 x 7 grid (Sangat efisien & hemat kertas!)
      const spacingX = 15;
      const spacingY = 12;

      const startX = 25;
      const startY = 30;

      (async () => {
        try {
          for (let index = 0; index < vouchers.length; index++) {
            const voucher = vouchers[index];
        if (index > 0 && index % cardsPerPage === 0) {
          doc.addPage();
        }

        const pageIndex = index % cardsPerPage;
        const col = pageIndex % cardsPerRow;
        const row = Math.floor(pageIndex / cardsPerRow);

        const x = startX + col * (cardWidth + spacingX);
        const y = startY + row * (cardHeight + spacingY);

        // 1. Tentukan warna bar kiri berdasarkan nama profil
        let color = '#009688'; // Default Teal

        const desc = (voucher.profile?.description || '').toLowerCase();
        const pName = (voucher.profile?.name || '').toLowerCase();

        if (
          desc.includes('1000') ||
          pName.includes('1k') ||
          pName.includes('1000')
        ) {
          color = '#2196F3'; // Blue
        } else if (
          desc.includes('5000') ||
          pName.includes('5k') ||
          pName.includes('5000')
        ) {
          color = '#FF9800'; // Orange
        } else if (
          desc.includes('3000') ||
          pName.includes('3k') ||
          pName.includes('3000')
        ) {
          color = '#009688'; // Teal
        }

        // Format validity & durasi seperti template PHP Anda
        let validityText = 'Aktif: -';
        const val = voucher.profile?.validity || '1d';
        if (val.endsWith('d')) validityText = `Aktif:${val.slice(0, -1)}Hari`;
        else if (val.endsWith('h'))
          validityText = `Aktif:${val.slice(0, -1)}Jam`;
        else validityText = `Aktif:${val}`;

        let durationText = 'Durasi: -';
        const limit = voucher.profile?.sessionTimeout || '5h';
        if (limit.endsWith('h'))
          durationText = `Durasi:${limit.slice(0, -1)}Jam`;
        else if (limit.endsWith('d'))
          durationText = `Durasi:${limit.slice(0, -1)}Hari`;
        else durationText = `Durasi:${limit}`;

        const limitData = voucher.profile?.limitUplink || ''; // optional datalimit

        // 2. Menggambar Border Kartu
        doc
          .roundedRect(x, y, cardWidth, cardHeight, 4)
          .lineWidth(1)
          .strokeColor('#2d3748') // border hitam bersih sesuai template Anda
          .stroke();

        // 3. Kolom Kiri: Bar Vertikal Warna
        doc
          .rect(x + 0.5, y + 0.5, 22, cardHeight - 1)
          .fillColor(color)
          .fill();

        // Menggambar garis pemisah bar kiri
        doc
          .moveTo(x + 22.5, y)
          .lineTo(x + 22.5, y + cardHeight)
          .lineWidth(1)
          .strokeColor('#2d3748')
          .stroke();

        // 4. Baris 1: Nama Hotspot & Icon WiFi (Kanan)
        doc
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .fillColor('#2d3748')
          .text(
            (voucher.outletName || voucher.server?.hotspotName || 'WIFI HOTSPOT').toUpperCase(),
            x + 27,
            y + 6,
            {
              width: cardWidth - 87,
              ellipsis: true,
            },
          );

        // Generate and draw QR Code
        const serverHost = voucher.server?.dnsName || voucher.server?.host || 'wifi.net';
        const loginUrl = `http://${serverHost}/login?username=${voucher.username}&password=${voucher.password}`;
        const qrBuffer = await QRCode.toBuffer(loginUrl, { 
          errorCorrectionLevel: 'M', 
          margin: 0, 
          width: 50,
          color: {
            dark: '#2d3748', // Tailwind slate-800
            light: '#ffffff'
          }
        });
        
        // Letakkan QR code di sisi kanan agak ke bawah sedikit
        doc.image(qrBuffer, x + 115, y + 25, { width: 50 });

        // 5. Baris 2: Monospace Credentials (Tengah)
        const isVcMode = voucher.username === voucher.password;

        if (isVcMode) {
          // Mode Voucher Code saja (Monospace Besar)
          doc
            .fontSize(15)
            .font('Courier-Bold')
            .fillColor('#000000')
            .text(voucher.username, x + 27, y + 25, {
              width: cardWidth - 87,
              align: 'center',
            });
        } else {
          // Mode Username + Password
          doc
            .fontSize(9.5)
            .font('Courier-Bold')
            .fillColor('#000000')
            .text(`U: ${voucher.username}`, x + 27, y + 21, {
              width: cardWidth - 87,
              align: 'center',
            });
          doc
            .fontSize(9.5)
            .font('Courier-Bold')
            .fillColor('#000000')
            .text(`P: ${voucher.password}`, x + 27, y + 33, {
              width: cardWidth - 87,
              align: 'center',
            });
        }

        // 6. Baris 3: Detail Paket (Validity, Duration, Datalimit)
        const detailParts = [validityText, durationText];
        if (limitData) detailParts.push(limitData);

        doc
          .fontSize(7.5)
          .font('Helvetica')
          .fillColor('#2d3748')
          .text(detailParts.join(' '), x + 27, y + 54, {
            width: cardWidth - 87,
          });

        // 7. Baris 4 & Footer: Info Portal Login & No Index
        const numLabel = `[${index + 1}]`;

        doc
          .fontSize(7)
          .font('Helvetica')
          .fillColor('#2d3748')
          .text(`Login: http://${serverHost}`, x + 27, y + 74, {
            width: cardWidth - 32,
          });

        // Draw No Index di pojok kanan bawah
        doc
          .fontSize(6)
          .font('Helvetica')
          .fillColor('#718096')
          .text(numLabel, x + cardWidth - 25, y + cardHeight - 11, {
            width: 20,
            align: 'right',
          });
          }
          
          doc.end();
        } catch (err) {
          doc.emit('error', err);
        }
      })();
    });
  }

  async getPdfForBatch(batchId: string) {
    const vouchers = await this.prisma.voucher.findMany({
      where: { batchId },
      include: { profile: true, server: true },
    });

    if (vouchers.length === 0) {
      throw new NotFoundException(
        `Batch voucher dengan ID "${batchId}" tidak ditemukan`,
      );
    }

    return this.generatePdf(vouchers);
  }

  async getPdfForSingle(id: string) {
    const voucher = await this.findOneForPdf(id);
    return this.generatePdf([voucher]);
  }

  async getPdfForFilter(serverId: string, profileId?: string, status?: string) {
    const whereClause: any = {
      serverId,
    };

    if (status && status !== 'ALL') {
      whereClause.status = status;
    }

    if (profileId && profileId !== 'ALL') {
      whereClause.profileId = profileId;
    }

    const vouchers = await this.prisma.voucher.findMany({
      where: whereClause,
      include: { profile: true, server: true },
      orderBy: { createdAt: 'desc' },
    });

    if (vouchers.length === 0) {
      throw new NotFoundException(
        `Tidak ada voucher yang cocok dengan kriteria filter untuk dicetak`,
      );
    }

    return this.generatePdf(vouchers);
  }

  async deleteBulk(ids: string[], user: AuthUser) {
    // 1. Ambil data semua voucher berdasarkan ids
    const vouchers = await this.prisma.voucher.findMany({
      where: { id: { in: ids } },
      include: { server: true },
    });

    if (vouchers.length === 0) {
      throw new NotFoundException('Tidak ada voucher yang ditemukan untuk dihapus');
    }

    // Scoping: semua voucher harus milik router user (else 403)
    for (const v of vouchers) {
      assertOwnerAccess(user, v.server.ownerId);
    }

    // 2. Validasi status harus UNUSED
    const hasUsed = vouchers.some(v => v.status !== 'UNUSED');
    if (hasUsed) {
      throw new BadRequestException('Hanya voucher dengan status UNUSED yang dapat dihapus');
    }

    // 3. Hapus di MikroTik (1 koneksi per server) lalu korelasikan hasilnya ke DB.
    //    Tidak ada lagi pre-check testConnection di sini: selain redundan, pre-check lama
    //    memakai password TERENKRIPSI (tanpa dekripsi) sehingga selalu gagal auth → false
    //    "router offline". removeHotspotUsersByNames sudah partial-safe: bila router offline,
    //    semua voucher masuk `failed` (tetap di DB) dan dilaporkan ke frontend.
    //    Partial-safe: DB hanya menghapus voucher yang BENAR-BENAR terhapus di router
    //    (removed) atau yang memang sudah tidak ada di router (notFound). Voucher yang
    //    GAGAL dihapus di router tetap di DB agar bisa di-retry — tidak hilang sepihak.
    const mainServerId = vouchers[0]?.serverId;

    // Kelompokkan username per server
    const usernamesByServer = new Map<string, string[]>();
    for (const voucher of vouchers) {
      const list = usernamesByServer.get(voucher.serverId) ?? [];
      list.push(voucher.username);
      usernamesByServer.set(voucher.serverId, list);
    }

    // username yang aman dihapus dari DB (sukses di router atau sudah tidak ada)
    const safeToDeleteUsernames = new Set<string>();
    const failedUsernames: string[] = [];

    for (const [serverId, names] of usernamesByServer.entries()) {
      const result = await this.mikrotikService.removeHotspotUsersByNames(serverId, names);
      for (const name of result.removed) safeToDeleteUsernames.add(name);
      for (const name of result.notFound) safeToDeleteUsernames.add(name);
      for (const name of result.failed) failedUsernames.push(name);
    }

    // Hapus dari DB hanya voucher yang aman
    const idsToDelete = vouchers
      .filter((v) => safeToDeleteUsernames.has(v.username))
      .map((v) => v.id);

    if (idsToDelete.length > 0) {
      await this.prisma.voucher.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    const deletedCount = idsToDelete.length;
    const failedCount = failedUsernames.length;
    const deletedUsernames = vouchers
      .filter((v) => safeToDeleteUsernames.has(v.username))
      .map((v) => v.username);

    // 6. Catat Log
    if (deletedCount > 0) {
      await this.activityLogService.logAction({
        action: 'VOUCHER_REVOKED',
        serverId: mainServerId,
        entity: 'Voucher',
        detail: `Menghapus ${deletedCount} voucher secara massal${failedCount > 0 ? `, ${failedCount} gagal` : ''} (${deletedUsernames.slice(0, 5).join(', ')}${deletedUsernames.length > 5 ? '...' : ''})`,
      });
    }

    const message =
      failedCount > 0
        ? `Berhasil menghapus ${deletedCount} voucher, ${failedCount} gagal dihapus di router dan tetap tersimpan. Silakan coba lagi.`
        : `Berhasil menghapus ${deletedCount} voucher`;

    return {
      success: failedCount === 0,
      message,
      deletedCount,
      failedCount,
      failedUsernames,
    };
  }
}
