/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { MikrotikService } from '../mikrotik/mikrotik.service.js';

type CharFormat =
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'MIXED_CASE'
  | 'LETTERS_ONLY'
  | 'NUMBERS_ONLY'
  | 'ALPHANUMERIC';

function generateRandomCode(length: number, format: CharFormat = 'UPPERCASE'): string {
  let chars: string;

  switch (format) {
    case 'UPPERCASE':
      // Huruf besar saja – hindari O, I agar tidak membingungkan
      chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      break;
    case 'LOWERCASE':
      // Huruf kecil saja – hindari o, i
      chars = 'abcdefghjklmnpqrstuvwxyz';
      break;
    case 'MIXED_CASE':
      // Huruf besar + kecil campur
      chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz';
      break;
    case 'LETTERS_ONLY':
      // Huruf besar saja + huruf kecil (tanpa angka)
      chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz';
      break;
    case 'NUMBERS_ONLY':
      // Angka saja – hindari 0 & 1 agar tidak mirip O & I
      chars = '23456789';
      break;
    case 'ALPHANUMERIC':
    default:
      // Campuran huruf besar + angka (default Mikhmon style)
      chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      break;
  }

  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

@Injectable()
export class VoucherQueueService implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue;
  private worker!: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
  ) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host') ?? 'localhost';
    const port = this.configService.get<number>('redis.port') ?? 6379;

    this.queue = new Queue('voucher-generation', {
      connection: { host, port },
    });

    this.worker = new Worker(
      'voucher-generation',
      async (job) => {
        const {
          serverId,
          profileId,
          count,
          usernamePrefix,
          charLength,
          charFormat,
          outletName,
          batchId,
        } = job.data;

        console.log(
          `🚀 [Queue Worker] Memulai proses batch "${batchId}" untuk ${count} voucher...`,
        );

        // 1. Ambil data profil hotspot dari DB
        const profile = await this.prisma.hotspotProfile.findUnique({
          where: { id: profileId },
        });
        if (!profile) {
          throw new Error(
            `Profil hotspot dengan ID ${profileId} tidak ditemukan`,
          );
        }

        const prefix = usernamePrefix || '';
        const len = charLength || 6;
        const fmt: CharFormat = (charFormat as CharFormat) || 'UPPERCASE';

        let createdCount = 0;

        for (let i = 0; i < count; i++) {
          let username = '';
          let isUnique = false;

          // Loop untuk memastikan username unik di database
          while (!isUnique) {
            username = `${prefix}${generateRandomCode(len, fmt)}`;
            const existing = await this.prisma.voucher.findUnique({
              where: { username },
            });
            if (!existing) isUnique = true;
          }

          const password = username; // default password disamakan dengan username untuk hotspot voucher

          try {
            // A. Simpan di DB local
            await this.prisma.voucher.create({
              data: {
                serverId,
                profileId,
                username,
                password,
                batchId,
                outletName,
                status: 'UNUSED',
              },
            });

            // B. Daftarkan di MikroTik CHR asli
            await this.mikrotikService.createHotspotUser(
              serverId,
              username,
              password,
              profile.name,
            );

            createdCount++;

            // Perbarui progress job
            await job.updateProgress(Math.round((createdCount / count) * 100));
          } catch (err: any) {
            console.error(
              `❌ [Worker] Gagal membuat voucher ${username} pada router:`,
              err.message || err,
            );
            // Tetap lanjutkan loop untuk voucher berikutnya agar tidak mandek total
          }
        }

        console.log(
          `✅ [Queue Worker] Batch "${batchId}" selesai! ${createdCount}/${count} voucher sukses didaftarkan.`,
        );
        return { success: true, count: createdCount, batchId };
      },
      {
        connection: { host, port },
        concurrency: 1, // Proses antrean satu per satu agar tidak membanting router MikroTik
      },
    );
  }

  async addJob(data: any) {
    return this.queue.add('generate-vouchers', data, {
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close();
    }
    if (this.worker) {
      await this.worker.close();
    }
  }
}
