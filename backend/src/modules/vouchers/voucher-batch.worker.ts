import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { MikrotikService } from '../mikrotik/mikrotik.service.js';

type CharFormat =
  | 'UPPERCASE'
  | 'LOWERCASE'
  | 'MIXED_CASE'
  | 'LETTERS_ONLY'
  | 'NUMBERS_ONLY'
  | 'ALPHANUMERIC';

/** Batas percobaan sebelum batch ditandai FAILED permanen. */
const MAX_ATTEMPTS = 3;

/**
 * Batch RUNNING yang tak tersentuh selama ini dianggap yatim — proses yang
 * mengerjakannya mati (container restart / OOM). Nilainya harus jauh lebih besar
 * dari durasi wajar satu batch agar batch yang masih sehat tak ikut direbut.
 */
const STALE_RUNNING_MS = 15 * 60 * 1000;

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

/** Baris voucher_batches yang dikembalikan query klaim. */
interface ClaimedBatch {
  batchId: string;
  serverId: string;
  profileId: string;
  count: number;
  createdCount: number;
  usernamePrefix: string | null;
  charLength: number;
  charFormat: string;
  outletName: string | null;
  attempts: number;
}

/**
 * Worker pembuatan voucher batch — antrean bersandar pada PostgreSQL.
 *
 * Menggantikan BullMQ + Redis. Alasannya: generate batch dipicu manual oleh
 * admin (bukan trafik tinggi), sehingga menambah satu service infra tidak
 * sepadan. Tabel `voucher_batches` justru memberi yang tak dipunyai BullMQ pada
 * pemakaian di sini — progres yang bisa ditanya lewat API dan kegagalan yang
 * tersimpan permanen.
 *
 * Alur:
 * 1. Poller periodik mengambil SATU batch PENDING tertua, dikunci dengan
 *    `FOR UPDATE SKIP LOCKED` sehingga aman walau ada beberapa instance.
 * 2. Voucher dibuat satu per satu: simpan ke DB lalu daftarkan ke MikroTik.
 *    `createdCount` diperbarui berkala sebagai progres.
 * 3. Selesai → DONE. Gagal → PENDING lagi sampai MAX_ATTEMPTS, lalu FAILED.
 *
 * Interval diatur via env `VOUCHER_BATCH_POLL_INTERVAL_MS` (default 5000).
 * Set <= 0 untuk menonaktifkan (mis. saat test/CI).
 */
@Injectable()
export class VoucherBatchWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoucherBatchWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private isRunning = false; // cegah dua putaran tumpang-tindih di instance ini
  private stopping = false; // dipakai agar batch berjalan berhenti rapi saat shutdown

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mikrotikService: MikrotikService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(
      this.configService.get<string>('VOUCHER_BATCH_POLL_INTERVAL_MS') ?? 5000,
    );

    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      this.logger.log('Worker voucher batch dinonaktifkan (interval <= 0).');
      return;
    }

    this.logger.log(`Worker voucher batch aktif: poll tiap ${intervalMs}ms.`);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    // Jangan biarkan interval menahan proses tetap hidup saat shutdown.
    this.timer.unref?.();
  }

  onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Satu putaran: pulihkan batch yatim, lalu kerjakan satu batch bila ada. */
  private async tick() {
    if (this.isRunning || this.stopping) return;
    this.isRunning = true;
    try {
      await this.recoverStaleBatches();
      const batch = await this.claimNextBatch();
      if (batch) await this.processBatch(batch);
    } catch (err) {
      this.logger.error(
        `Putaran worker gagal: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Kembalikan batch RUNNING yang mandek ke PENDING agar bisa dikerjakan ulang.
   * Terjadi bila proses mati di tengah jalan; tanpa ini batch akan menggantung
   * selamanya.
   */
  private async recoverStaleBatches() {
    const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
    const { count } = await this.prisma.voucherBatch.updateMany({
      where: { status: 'RUNNING', updatedAt: { lt: cutoff } },
      data: { status: 'PENDING' },
    });
    if (count > 0) {
      this.logger.warn(
        `${count} batch RUNNING yang mandek dikembalikan ke PENDING.`,
      );
    }
  }

  /**
   * Ambil satu batch PENDING tertua dan tandai RUNNING dalam satu pernyataan.
   *
   * `FOR UPDATE SKIP LOCKED` membuat dua instance tak mungkin mengambil batch
   * yang sama: instance kedua melewati baris yang sedang dikunci, bukan menunggu.
   */
  private async claimNextBatch(): Promise<ClaimedBatch | null> {
    const rows = await this.prisma.$queryRaw<ClaimedBatch[]>`
      UPDATE voucher_batches
      SET status = 'RUNNING',
          "startedAt" = COALESCE("startedAt", NOW()),
          attempts = attempts + 1,
          "updatedAt" = NOW()
      WHERE "batchId" = (
        SELECT "batchId" FROM voucher_batches
        WHERE status = 'PENDING'
        ORDER BY "createdAt"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "batchId", "serverId", "profileId", count, "createdCount",
                "usernamePrefix", "charLength", "charFormat", "outletName", attempts
    `;
    return rows[0] ?? null;
  }

  /** Kerjakan satu batch sampai selesai atau gagal. */
  private async processBatch(batch: ClaimedBatch) {
    const {
      batchId,
      serverId,
      profileId,
      count,
      usernamePrefix,
      charLength,
      charFormat,
      outletName,
      attempts,
    } = batch;

    this.logger.log(
      `Batch "${batchId}" mulai diproses (${count} voucher, percobaan ke-${attempts}).`,
    );

    try {
      const profile = await this.prisma.hotspotProfile.findUnique({
        where: { id: profileId },
      });
      if (!profile) {
        throw new Error(`Profil hotspot dengan ID ${profileId} tidak ditemukan`);
      }

      const prefix = usernamePrefix ?? '';
      const len = charLength || 6;
      const fmt = (charFormat as CharFormat) || 'UPPERCASE';

      // Batch yang diulang melanjutkan dari yang sudah jadi, bukan dari nol.
      //
      // Sumber kebenarannya adalah JUMLAH BARIS di tabel vouchers, bukan kolom
      // createdCount: kolom itu ditulis berkala (tiap 10 voucher) sehingga bisa
      // tertinggal bila proses mati di tengah. Memakai kolom yang tertinggal
      // akan membuat percobaan ulang mencetak voucher melebihi jumlah diminta.
      let createdCount = await this.prisma.voucher.count({ where: { batchId } });
      let routerFailures = 0; // voucher yang ada di DB tapi gagal masuk router

      for (let i = createdCount; i < count; i++) {
        if (this.stopping) {
          this.logger.warn(
            `Batch "${batchId}" dihentikan di tengah jalan (shutdown). ` +
              `Sisa akan dilanjutkan setelah proses hidup kembali.`,
          );
          // Balikkan ke PENDING supaya putaran berikutnya melanjutkan.
          await this.prisma.voucherBatch.update({
            where: { batchId },
            data: { status: 'PENDING', createdCount },
          });
          return;
        }

        let username = '';
        let isUnique = false;

        // Ulangi sampai dapat username yang belum terpakai di DB.
        while (!isUnique) {
          username = `${prefix}${generateRandomCode(len, fmt)}`;
          const existing = await this.prisma.voucher.findUnique({
            where: { username },
          });
          if (!existing) isUnique = true;
        }

        const password = username; // default password disamakan dengan username untuk hotspot voucher

        // A. Simpan di DB lokal. Kegagalan di sini berarti voucher tak jadi sama
        //    sekali, jadi createdCount TIDAK bertambah dan loop lanjut.
        try {
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
          createdCount++;
        } catch (err) {
          this.logger.warn(
            `Voucher ${username} gagal disimpan ke DB: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          continue;
        }

        // B. Daftarkan di MikroTik. Voucher sudah ada di DB, jadi kegagalan di
        //    sini TIDAK mengurangi createdCount — kalau tidak, hitungan akan
        //    menyimpang dari isi tabel dan percobaan ulang mencetak kelebihan.
        //    Voucher yatim seperti ini bisa didamaikan lewat sinkronisasi router.
        try {
          await this.mikrotikService.createHotspotUser(
            serverId,
            username,
            password,
            profile.name,
          );
        } catch (err) {
          routerFailures++;
          this.logger.warn(
            `Voucher ${username} tersimpan di DB tapi gagal didaftarkan ke router: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }

        // Simpan progres berkala saja — menulis tiap voucher terlalu boros.
        if (createdCount % 10 === 0 || createdCount === count) {
          await this.prisma.voucherBatch.update({
            where: { batchId },
            data: { createdCount },
          });
        }
      }

      await this.prisma.voucherBatch.update({
        where: { batchId },
        data: {
          status: 'DONE',
          createdCount,
          finishedAt: new Date(),
          // Batch tetap DONE walau sebagian gagal masuk router — voucher-nya ada.
          // Catat sebagai peringatan agar tak hilang senyap seperti dulu.
          errorMessage:
            routerFailures > 0
              ? `${routerFailures} voucher tersimpan di DB tapi gagal didaftarkan ke router`
              : null,
        },
      });

      this.logger.log(
        `Batch "${batchId}" selesai: ${createdCount}/${count} voucher dibuat` +
          (routerFailures > 0 ? `, ${routerFailures} gagal masuk router.` : '.'),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Kegagalan di tingkat batch (mis. profil hilang, DB putus) — coba lagi
      // sampai batas percobaan, setelah itu tandai FAILED agar tak berputar terus.
      const exhausted = attempts >= MAX_ATTEMPTS;

      await this.prisma.voucherBatch.update({
        where: { batchId },
        data: {
          status: exhausted ? 'FAILED' : 'PENDING',
          errorMessage: message,
          finishedAt: exhausted ? new Date() : null,
        },
      });

      this.logger.error(
        exhausted
          ? `Batch "${batchId}" GAGAL permanen setelah ${attempts} percobaan: ${message}`
          : `Batch "${batchId}" gagal (percobaan ${attempts}/${MAX_ATTEMPTS}), akan diulang: ${message}`,
      );
    }
  }
}
