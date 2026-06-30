import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Integrasi Payment Gateway Duitku (mode Sandbox).
 *
 * - createInvoice (POP): SHA256(merchantCode + timestamp + apiKey) di header.
 * - callback signature: MD5(merchantCode + amount + merchantOrderId + apiKey).
 *
 * Kredensial dibaca dari env: DUITKU_MERCHANT_CODE, DUITKU_API_KEY,
 * DUITKU_BASE_URL, DUITKU_CALLBACK_URL, DUITKU_RETURN_URL.
 */
@Injectable()
export class DuitkuService {
  private readonly logger = new Logger(DuitkuService.name);

  private cfg() {
    return {
      merchantCode: process.env.DUITKU_MERCHANT_CODE || '',
      apiKey: process.env.DUITKU_API_KEY || '',
      baseUrl: process.env.DUITKU_BASE_URL || 'https://sandbox.duitku.com',
      callbackUrl: process.env.DUITKU_CALLBACK_URL || '',
      returnUrl: process.env.DUITKU_RETURN_URL || '',
    };
  }

  isConfigured(): boolean {
    const { merchantCode, apiKey } = this.cfg();
    return Boolean(merchantCode && apiKey);
  }

  /**
   * Buat invoice (halaman bayar) di Duitku → kembalikan paymentUrl + reference.
   */
  async createInvoice(params: {
    merchantOrderId: string;
    amount: number;
    productDetails: string;
    email: string;
    customerName: string;
  }): Promise<{ paymentUrl: string; reference: string }> {
    const { merchantCode, apiKey, baseUrl, callbackUrl, returnUrl } = this.cfg();
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Duitku belum dikonfigurasi (DUITKU_MERCHANT_CODE / DUITKU_API_KEY kosong di .env)',
      );
    }

    const timestamp = Date.now().toString();
    const signature = crypto
      .createHash('sha256')
      .update(merchantCode + timestamp + apiKey)
      .digest('hex');

    const body = {
      paymentAmount: params.amount,
      merchantOrderId: params.merchantOrderId,
      productDetails: params.productDetails,
      email: params.email,
      customerVaName: params.customerName,
      callbackUrl,
      returnUrl,
      expiryPeriod: 60,
    };

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/merchant/createInvoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-duitku-signature': signature,
          'x-duitku-timestamp': timestamp,
          'x-duitku-merchantcode': merchantCode,
        },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      throw new ServiceUnavailableException(
        `Gagal menghubungi Duitku: ${e?.message ?? e}`,
      );
    }

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.paymentUrl) {
      this.logger.warn(
        `createInvoice gagal (${res.status}): ${JSON.stringify(data)}`,
      );
      throw new ServiceUnavailableException(
        `Gagal membuat invoice Duitku: ${data?.statusMessage || res.status}`,
      );
    }

    return { paymentUrl: data.paymentUrl, reference: data.reference };
  }

  /**
   * Validasi signature callback Duitku.
   * Rumus: MD5(merchantCode + amount + merchantOrderId + apiKey).
   */
  verifyCallbackSignature(p: {
    merchantCode?: string;
    amount?: string | number;
    merchantOrderId?: string;
    signature?: string;
  }): boolean {
    const { merchantCode, apiKey } = this.cfg();
    if (!apiKey || !merchantCode) return false;
    // merchantCode pada callback harus sama dengan milik kita
    if (p.merchantCode !== merchantCode) return false;

    const expected = crypto
      .createHash('md5')
      .update(`${merchantCode}${p.amount ?? ''}${p.merchantOrderId ?? ''}${apiKey}`)
      .digest('hex');

    const got = (p.signature || '').toLowerCase();
    if (got.length !== expected.length) return false;
    // Bandingkan konstan-waktu untuk hindari timing attack
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  }
}
