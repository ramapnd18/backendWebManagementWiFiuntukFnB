# API — Billing, Kuota & Duitku

**Modul:** `billing` (+ `DuitkuService`).
**Status:** ✅ Implementasi selesai & terverifikasi runtime (2026-06-28).
**Base URL:** `http://localhost:4000/api`
**Hasil uji menyeluruh:** lihat [`doc/api/billing-test-results.md`](./billing-test-results.md) — **33/33 skenario lulus** (2026-06-29).

Paket langganan membatasi jumlah router per Owner. Pembayaran upgrade via **Duitku (Sandbox)**.
Webhook memvalidasi signature → set `PAID` → aktifkan langganan → perbarui batas router + `expiredAt`.

---

## Konsep

- **Plan** (paket): `code` (FREE/STANDARD), `name`, `maxRouters`, `price` (Rp), `durationDays`.
  - Seed: **Gratis** (`FREE`, 1 router, gratis selamanya) · **Standar** (`STANDARD`, 5 router, Rp50.000/30 hari).
- **Subscription** = sumber kebenaran kuota. Owner punya 1 langganan AKTIF; batas = `plan.maxRouters`.
  - Owner baru otomatis dapat langganan `FREE` (`expiredAt = null` → tak kadaluarsa).
- **PaymentTransaction**: `merchantOrderId` (unik, idempotensi), `amount`, `status` (PENDING/PAID/FAILED/EXPIRED).
- **Kuota router** ditegakkan di `POST /servers`: tolak **403** bila jumlah router ≥ `maxRouters` atau langganan kadaluarsa.

---

## Matriks Akses

| Endpoint | SUPER_ADMIN | OWNER | TEKNISI |
|----------|:-:|:-:|:-:|
| `GET /billing/plans` | ✅ | ✅ | ✅ |
| `GET /billing/me` | ❌ | ✅ | ✅ (Owner-nya) |
| `POST /billing/checkout` | ❌ | ✅ | ❌ 403 |
| `POST /billing/duitku/callback` | publik (signature) | | |

---

## Endpoint

### 1. Daftar paket — `GET /api/billing/plans`

Butuh JWT (semua role).

**Response 200 (Success)**
```json
[
  { "id": "cmqx...", "code": "FREE", "name": "Gratis", "maxRouters": 1, "price": 0, "durationDays": null, "isActive": true },
  { "id": "cmqx...", "code": "STANDARD", "name": "Standar", "maxRouters": 5, "price": 50000, "durationDays": 30, "isActive": true }
]
```

---

### 2. Status langganan & kuota — `GET /api/billing/me`

Butuh JWT (OWNER / TEKNISI). TEKNISI melihat status Owner-nya.

**Response 200 (Success)**
```json
{
  "plan": { "code": "FREE", "name": "Gratis" },
  "maxRouters": 1,
  "used": 0,
  "remaining": 1,
  "expiredAt": null,
  "expired": false,
  "expiredPlanName": null,
  "subscription": { "id": "cmqx...", "status": "ACTIVE", "plan": { "code": "FREE" } }
}
```
> Bila langganan **berbayar** telah lewat masa berlaku: `expired: true`, `expiredPlanName: "Standar"`,
> `expiredAt` = tanggal lampau, dan `plan`/`maxRouters` turun ke FREE. `subscription` = `null`.

**Response 403 (Error — Super Admin / role tak sesuai)**
```json
{ "statusCode": 403, "message": "Anda tidak punya hak akses untuk resource ini", "error": "Forbidden" }
```

---

### 3. Checkout upgrade paket — `POST /api/billing/checkout`

Butuh JWT (**OWNER saja**). Membuat invoice Duitku & transaksi `PENDING`.

**Request Payload**
```json
{ "planCode": "STANDARD" }
```

**Response 201 (Success)**
```json
{
  "merchantOrderId": "SUB-7ol4lt-1751093818627",
  "reference": "DXXXXYYYYY",
  "paymentUrl": "https://sandbox.duitku.com/topup/v2/...",
  "amount": 50000,
  "plan": "Standar"
}
```
> Frontend mengarahkan user ke `paymentUrl` untuk membayar.

**Response 400 (Error — paket gratis)**
```json
{ "statusCode": 400, "message": "Paket gratis tidak memerlukan pembayaran", "error": "Bad Request" }
```

**Response 403 (Error — bukan Owner)**
```json
{ "statusCode": 403, "message": "Hanya Owner yang dapat membeli/upgrade paket", "error": "Forbidden" }
```

**Response 404 / 503 (Error)**
```json
{ "statusCode": 404, "message": "Paket \"XXX\" tidak ditemukan", "error": "Not Found" }
```
```json
{ "statusCode": 503, "message": "Duitku belum dikonfigurasi (DUITKU_MERCHANT_CODE / DUITKU_API_KEY kosong di .env)", "error": "Service Unavailable" }
```

---

### 4. Webhook callback — `POST /api/billing/duitku/callback`

**TANPA JWT** — dipanggil server Duitku. Body `application/x-www-form-urlencoded`.
Keamanan: **validasi signature** + **idempoten** sebelum mengubah data.

**Signature (Duitku):** `MD5(merchantCode + amount + merchantOrderId + apiKey)`.

**Request Payload (dikirim Duitku)**
```
merchantCode=DXXXX&amount=50000&merchantOrderId=SUB-...&resultCode=00&reference=DXXXX...&paymentCode=VC&signature=<md5>
```
- `resultCode` `00` = sukses.

**Proses bila sukses & signature valid:**
1. `PaymentTransaction.status` → `PAID`, `paidAt` diisi.
2. Langganan AKTIF lama → `EXPIRED`; buat langganan baru `ACTIVE` (`expiredAt = now + durationDays`).
3. Batas router otomatis mengikuti `plan.maxRouters` baru.
4. Catat `ActivityLog` (`PAYMENT_RECEIVED`, `SUBSCRIPTION_ACTIVATED`).

**Response 200 (Success)**
```json
{ "received": true }
```
**Response 200 (sudah diproses — idempoten)**
```json
{ "received": true, "idempotent": true }
```

**Response 403 (Error — signature invalid)**
```json
{ "statusCode": 403, "message": "Signature callback tidak valid", "error": "Forbidden" }
```

---

## Penegakan Kuota di `POST /api/servers`

Sebelum membuat router, `BillingService.assertCanAddRouter(ownerId)` dijalankan.

**Response 403 (Error — kuota penuh)**
```json
{ "statusCode": 403, "message": "Kuota router penuh (1/1). Upgrade paket untuk menambah router.", "error": "Forbidden" }
```
**Response 403 (Error — langganan berbayar kadaluarsa)**
```json
{ "statusCode": 403, "message": "Langganan Standar Anda sudah kadaluarsa (28/6/2026). Perpanjang paket untuk menambah router.", "error": "Forbidden" }
```
> Cek kadaluarsa didahulukan sebelum cek jumlah kuota, sehingga pesan yang muncul jelas (perpanjang, bukan "kuota penuh").

---

## Environment (`.env`)

```
DUITKU_MERCHANT_CODE=        # dari dashboard sandbox
DUITKU_API_KEY=              # dari dashboard sandbox
DUITKU_BASE_URL=https://sandbox.duitku.com
DUITKU_CALLBACK_URL=http://localhost:4000/api/billing/duitku/callback
DUITKU_RETURN_URL=http://localhost:3100/billing/result
```
> Tanpa `DUITKU_MERCHANT_CODE`/`DUITKU_API_KEY`, `checkout` mengembalikan **503**
> (kuota & callback-signature tetap berfungsi untuk diuji).

---

## Catatan Verifikasi (2026-06-28)

Terbukti runtime: kuota free (1) blokir router ke-2 (403) → checkout (FREE 400, Teknisi 403) →
callback signature salah 403 → callback valid 200 (langganan jadi STANDARD, batas 1→5, `expiredAt` +30 hari) →
replay idempoten 200 → router ke-2 lolos (201). Build `npm run build` 0 error.
