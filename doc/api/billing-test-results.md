# Hasil Uji Endpoint Billing & Kuota (Duitku)

**Tanggal uji:** 2026-06-29
**Lingkungan:** lokal — backend `http://localhost:4000/api` (prod build), PostgreSQL 18 (Docker :5433).
**Kredensial Duitku:** kredensial **test** (`DTEST` / `sandboxkey123`) di-set via env saat run agar
validasi signature callback dapat diuji. (`.env` repo tetap kosong → diisi user dgn kredensial sandbox asli.)
**Metode:** black-box `curl` + verifikasi state DB (Prisma) untuk efek samping (PAID, langganan, kuota).

## Ringkasan

| | |
|---|---|
| Total skenario | **33** |
| ✅ Lulus | **33** |
| ❌ Gagal | **0** |

Mencakup: daftar paket, status langganan, **penegakan kuota**, guard checkout, **webhook Duitku**
(signature + idempotensi + aktivasi), kuota setelah upgrade, dan perilaku saat langganan kadaluarsa.

---

## A. Daftar Paket — `GET /api/billing/plans`

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| GET `/billing/plans` (tanpa token) | — | 401 | 401 | ✅ |
| GET `/billing/plans` | OWNER | 200 | 200 | ✅ |
| GET `/billing/plans` | TEKNISI | 200 | 200 | ✅ |
| GET `/billing/plans` | SUPER_ADMIN | 200 | 200 | ✅ |
| ↳ jumlah paket = 2 (FREE, STANDARD) | — | 2 | 2 | ✅ |

---

## B. Status Langganan — `GET /api/billing/me`

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| GET `/billing/me` (tanpa token) | — | 401 | 401 | ✅ |
| GET `/billing/me` | OWNER | 200 | 200 | ✅ |
| GET `/billing/me` | TEKNISI | 200 | 200 | ✅ |
| GET `/billing/me` | SUPER_ADMIN | 403 | 403 | ✅ |
| ↳ paket awal = FREE | OWNER | FREE | FREE | ✅ |
| ↳ maxRouters = 1 | OWNER | 1 | 1 | ✅ |

---

## C. Penegakan Kuota — `POST /api/servers`

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| POST `/servers` #1 (dalam kuota FREE=1) | TEKNISI | 201 | 201 | ✅ |
| ↳ `used` = 1 setelah 1 router | OWNER | 1 | 1 | ✅ |
| ↳ `remaining` = 0 | OWNER | 0 | 0 | ✅ |
| POST `/servers` #2 (kuota penuh) | TEKNISI | 403 | 403 | ✅ |

Body 403: `{"message":"Kuota router penuh (1/1). Upgrade paket untuk menambah router.","error":"Forbidden","statusCode":403}`

---

## D. Checkout (guard) — `POST /api/billing/checkout`

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| POST `/billing/checkout` (tanpa token) | — | 401 | 401 | ✅ |
| POST `/billing/checkout` (STANDARD) | TEKNISI | 403 | 403 | ✅ |
| POST `/billing/checkout` (paket FREE) | OWNER | 400 | 400 | ✅ |
| POST `/billing/checkout` (paket tidak ada) | OWNER | 404 | 404 | ✅ |

> **Checkout sukses (201 + `paymentUrl`)** memerlukan kredensial **Duitku sandbox asli** dan panggilan
> jaringan ke Duitku — tidak di-assert di suite ini (di luar lapisan logika lokal). Tanpa kredensial
> valid, `checkout` mengembalikan **503** (terbukti di pilar C). Lihat `doc/api/billing.md` untuk contoh respons sukses.

---

## E. Webhook Callback — `POST /api/billing/duitku/callback`

Signature: `MD5(merchantCode + amount + merchantOrderId + apiKey)`. Diuji dgn 2 transaksi `PENDING`
yang disiapkan di DB (`PAY-OK-1`, `PAY-FAIL-1`, paket STANDARD Rp50.000).

| Skenario | Harapan | Aktual | Status |
|---|:-:|:-:|:-:|
| callback signature **salah** ditolak | 403 | 403 | ✅ |
| callback `resultCode=01` (gagal) | 200 | 200 | ✅ |
| callback `resultCode=00` (sukses) | 200 | 200 | ✅ |
| callback **REPLAY** (idempoten) | 200 | 200 | ✅ |
| ↳ transaksi `PAY-OK-1` → `PAID` | PAID | PAID | ✅ |
| ↳ transaksi `PAY-FAIL-1` → `FAILED` | FAILED | FAILED | ✅ |
| ↳ langganan aktif → `STANDARD` | STANDARD | STANDARD | ✅ |
| ↳ jumlah langganan aktif = 1 (replay tak dobel) | 1 | 1 | ✅ |

Body 403 signature invalid: `{"message":"Signature callback tidak valid","error":"Forbidden","statusCode":403}`

---

## F. Kuota Setelah Upgrade

Setelah callback sukses, langganan menjadi STANDARD → batas router otomatis naik.

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| ↳ paket = STANDARD | OWNER | STANDARD | STANDARD | ✅ |
| ↳ maxRouters = 5 | OWNER | 5 | 5 | ✅ |
| POST `/servers` #2 (kuota kini 5) | TEKNISI | 201 | 201 | ✅ |

---

## G. Langganan Kadaluarsa

`expiredAt` langganan STANDARD di-set ke masa lalu (simulasi kadaluarsa).

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| `/billing/me` fallback ke FREE | OWNER | FREE | FREE | ✅ |
| ↳ maxRouters turun ke 1 | OWNER | 1 | 1 | ✅ |
| POST `/servers` (kadaluarsa → batas FREE, 2>1) | TEKNISI | 403 | 403 | ✅ |

> **Perilaku saat kadaluarsa (sudah DIPERBAIKI 2026-06-29):** bila langganan **berbayar** lewat masa berlaku,
> `getEffectiveLimit` menandai `expired:true` (batas turun ke FREE untuk tampilan), dan `assertCanAddRouter`
> **menolak penambahan router secara eksplisit** dengan pesan "perpanjang", lebih dulu dari cek kuota:
>
> `{"message":"Langganan Standar Anda sudah kadaluarsa (28/6/2026). Perpanjang paket untuk menambah router.","error":"Forbidden","statusCode":403}`
>
> `GET /billing/me` kini menyertakan field `expired` & `expiredPlanName`. Verifikasi terarah:
> kadaluarsa (0 router) → 403 pesan kadaluarsa · STANDARD aktif → 201 · FREE penuh → tetap "Kuota router penuh" (regresi aman).

---

## Bukti (contoh respons)

**`GET /billing/me` — paket FREE (awal):**
```json
{ "plan": { "code": "FREE", "name": "Gratis" }, "maxRouters": 1, "used": 0, "remaining": 1, "expiredAt": null }
```

**`GET /billing/me` — setelah upgrade (callback PAID):**
```json
{ "plan": { "code": "STANDARD", "name": "Standar" }, "maxRouters": 5, "used": 1, "remaining": 4, "expiredAt": "2026-07-29T12:52:04.872Z" }
```

---

## Catatan Metodologi

- `POST /auth/login` dibatasi 5/menit/IP → suite memakai 3 login (owner/teknisi/super); throttle in-memory
  di-reset dengan restart server sebelum run.
- Endpoint `checkout` yang memanggil Duitku **tidak** diuji untuk jalur sukses (butuh kredensial sandbox
  asli + jaringan); hanya guard otorisasi/validasi yang di-assert.
- Efek samping callback (PAID, FAILED, langganan, kuota) diverifikasi langsung ke DB via Prisma.
- Data uji (router, transaksi, langganan) dibuat saat tes lalu **dibersihkan**; DB kembali ke kondisi seed
  (1 SUPER_ADMIN / 1 OWNER / 1 TEKNISI, 0 router, owner pada paket FREE).
- Skrip uji & helper berada di luar repo (scratchpad); hasil ini dari run terakhir: **33/33 lulus**.
