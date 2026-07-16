# Hasil Uji Endpoint POS

**Tanggal uji:** 2026-07-16
**Lingkungan:** backend `http://localhost:4000/api` (prod build), PostgreSQL & Redis (Docker),
router uji **MikroTik CHR 7.19.3** (`192.168.56.101:8728`, RouterOS API binary) — **ONLINE**.
**Metode:** uji black-box via `curl`, membandingkan **HTTP status** & isi respons aktual vs harapan.
**Cakupan:** kelola API key (JWT), endpoint mesin kasir (`x-api-key`), idempotensi, dan riwayat transaksi (JWT).

> Panduan uji manual langkah-demi-langkah: [`pos-testing.md`](./pos-testing.md). Kontrak endpoint: [`pos.md`](./pos.md).

## Ringkasan

| | |
|---|---|
| Total skenario | **9** |
| ✅ Lulus | **9** |
| ❌ Gagal | **0** |

> Akun seed: OWNER `owner@…`, TEKNISI `teknisi@…` (milik owner). Server uji `CHR-Lab` (milik owner).

---

## A. Kelola API Key (`/api/pos-keys` — JWT)

| Method · Endpoint | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| POST `/pos-keys` (buat key utk server) | TEKNISI | 201 + key mentah sekali | 201 | ✅ |
| GET `/pos-keys` (ter-mask) | OWNER | 200 | 200 | ✅ |

**Respons POST `/pos-keys` (201)** — key mentah hanya tampil sekali:
```json
{
  "id": "cmrn5ct4d001ufgl4pfhuli6s",
  "label": "Kasir Uji",
  "serverId": "cmrn592y70000fgl4aq3nkd6s",
  "serverName": "CHR-Lab",
  "key": "pos_521d3ad7xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",  // contoh — key mentah asli disamarkan
  "message": "Simpan key ini sekarang. Key mentah TIDAK akan ditampilkan lagi."
}
```
`GET /pos-keys` mengembalikan `maskedKey` (`pos_521d3ad7••••••`), `isActive`, `lastUsedAt` — bukan key mentah.

---

## B. Endpoint Mesin Kasir (`/api/pos/v1/*` — `x-api-key`)

| Method · Endpoint | Auth | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| GET `/pos/v1/profiles` (key valid) | x-api-key | 200 | 200 | ✅ |
| GET `/pos/v1/profiles` (tanpa key / key salah) | — | 401 | 401 | ✅ |
| POST `/pos/v1/trigger-voucher` (baru) | x-api-key | 201 | 201 | ✅ |
| POST `/pos/v1/trigger-voucher` (`transactionId` sama — idempoten) | x-api-key | 200 (voucher sama) | 200 | ✅ |

**Respons trigger-voucher (201)** — voucher dibuat baru di router + QR untuk struk:
```json
{
  "transactionId": "TRX-1784184483",
  "voucher": {
    "username": "414581", "password": "414581",
    "profileName": "default", "rateLimit": "2M/2M", "validity": "1d",
    "loginUrl": "http://192.168.56.101/login?username=414581&password=414581",
    "qrBase64": "data:image/png;base64,iVBORw0KGgo...",
    "instructions": "Sambungkan ke WiFi ... → scan QR / buka login → masukkan username & password."
  }
}
```
Request kedua dengan `transactionId` yang sama → **200** dan voucher **identik** (tidak membuat user baru di router).

**Respons 401 (tanpa/keliru key):**
```json
{ "message": "API key tidak valid", "error": "Unauthorized", "statusCode": 401 }
```

---

## C. Riwayat Transaksi (`/api/pos/transactions` — JWT, ter-scope)

| Method · Endpoint | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| GET `/pos/transactions?take=3` | OWNER | 200 `{data,meta}` ter-scope | 200 | ✅ |

**Respons (200)** — tiap item menyertakan relasi ringkas `server`/`profile`/`voucher`:
```json
{
  "data": [
    {
      "transactionId": "TRX-1784184483", "status": "SUCCESS", "outletName": "Kafe A",
      "server": { "id": "cmrn592y7...", "name": "CHR-Lab" },
      "profile": { "id": "cmrn5bdxq...", "name": "default" },
      "voucher": { "id": "cmrn5dhzk...", "username": "414581", "status": "UNUSED" }
    }
  ],
  "meta": { "total": 1, "skip": 0, "take": 3 }
}
```

---

## Catatan

- Voucher POS **dibuat baru** di router saat trigger (bukan ambil stok); idempotensi dijaga oleh
  `PosTransaction.transactionId` unik.
- Scoping riwayat memakai relasi `server → ownerId`: OWNER/TEKNISI hanya melihat transaksi router miliknya.
- Aksi POS tercatat di Activity Log (`POS_VOUCHER_GENERATED`, `POS_TRANSACTION_RECEIVED`).
