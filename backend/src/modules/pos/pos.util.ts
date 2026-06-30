import { createHash, randomBytes } from 'node:crypto';

/**
 * Helper untuk API key POS (lihat doc/POS_INTEGRATION.md §2).
 *
 * SHA-256 tanpa salt boleh di sini karena API key ber-entropi tinggi
 * (beda dengan password user) & hash deterministik supaya bisa di-index
 * untuk lookup cepat.
 */

const KEY_PREFIX = 'pos_';
const PREFIX_DISPLAY_LENGTH = 12; // jumlah char awal yang disimpan utk tampilan ter-mask

/** Hash sebuah API key mentah menjadi hex SHA-256 (untuk disimpan & di-lookup). */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generate API key POS baru.
 * @returns rawKey (ditampilkan sekali ke admin), keyHash (disimpan), prefix (tampilan ter-mask).
 */
export function generatePosApiKey(): {
  rawKey: string;
  keyHash: string;
  prefix: string;
} {
  const rawKey = KEY_PREFIX + randomBytes(24).toString('hex'); // pos_ + 48 char hex
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    prefix: rawKey.slice(0, PREFIX_DISPLAY_LENGTH),
  };
}

/** Bentuk ter-mask untuk ditampilkan di list (mis. "pos_a1b2c3d4••••••"). */
export function maskApiKey(prefix: string): string {
  return `${prefix}••••••`;
}

/**
 * Generate kode voucher numerik unik panjang `length` (default 6).
 * POS memakai angka sesuai arahan mentor (doc/POS_INTEGRATION.md §1).
 */
export function generateNumericCode(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}
