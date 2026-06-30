/**
 * Utilitas enkripsi kredensial sensitif (password router MikroTik) — AES-256-GCM.
 *
 * Format tersimpan: `enc:v1:<ivBase64>:<tagBase64>:<cipherBase64>`
 * Prefix `enc:v1:` dipakai untuk deteksi: nilai TANPA prefix dianggap plaintext
 * lama (legacy) sehingga pembacaan tetap kompatibel selama masa transisi.
 *
 * Master key dari env `MIKROTIK_ENC_KEY` (disarankan 64 char hex = 32 byte).
 * Bila bukan hex 64 char, key diturunkan via SHA-256 agar selalu 32 byte.
 */
import * as crypto from 'crypto';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.MIKROTIK_ENC_KEY;
  if (!raw) {
    throw new Error(
      'MIKROTIK_ENC_KEY belum diset di environment — wajib untuk enkripsi kredensial router.',
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw).digest();
}

/** True bila nilai sudah dalam format terenkripsi. */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** Enkripsi plaintext. String kosong/null dikembalikan apa adanya. */
export function encryptSecret(plain: string | null | undefined): string {
  if (!plain) return plain ?? '';
  if (isEncrypted(plain)) return plain; // sudah terenkripsi, jangan dobel
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
  );
}

/** Dekripsi. Nilai tanpa prefix dianggap plaintext legacy → dikembalikan apa adanya. */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored || !isEncrypted(stored)) return stored ?? '';
  const key = getKey();
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
