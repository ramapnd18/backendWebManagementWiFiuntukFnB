# Panduan Frontend — Integrasi Duitku (Mode Sandbox)

**Untuk:** tim Frontend.
**Tujuan:** acuan tunggal agar tidak ada salah persepsi soal alur pembayaran & konfigurasi Duitku.
**Mode:** **Sandbox** (`https://sandbox.duitku.com`) — belum production.
**Backend base URL:** `http://localhost:4000/api`
**Dokumen terkait:** [`billing.md`](./billing.md) (referensi endpoint) · [`billing-test-results.md`](./billing-test-results.md) (hasil uji 33/33).

---

## 0. TL;DR (baca ini dulu)

1. Frontend **tidak berkomunikasi langsung** ke Duitku untuk membuat pembayaran. Selalu lewat backend (`POST /api/billing/checkout`).
2. Backend mengembalikan **`paymentUrl`** (untuk metode Redirect) **dan** **`reference`** (untuk metode Popup). Pilih salah satu metode di frontend.
3. **JANGAN** menandai transaksi "lunas" berdasarkan Return URL / popup callback. **Status lunas HANYA boleh dibaca dari backend** (`GET /api/billing/me`). Sumber kebenaran = webhook Duitku → backend.
4. Kredensial Duitku (merchant code / API key) **hanya ada di backend `.env`**. Frontend **tidak boleh** menyimpan API key apa pun.

---

## 1. Pembagian tugas Backend vs Frontend

| Bagian | Pemilik | Keterangan |
|--------|:-------:|------------|
| Membuat invoice ke Duitku (`createInvoice`) | **Backend** | Frontend tidak memanggil Duitku langsung |
| Validasi signature & webhook callback | **Backend** | Sumber kebenaran status bayar |
| Menampilkan tombol upgrade & memicu bayar | **Frontend** | Redirect atau Popup |
| Halaman "hasil pembayaran" (Return URL) | **Frontend** | Hanya tampilan; harus konfirmasi ke backend |
| Menampilkan status paket & kuota | **Frontend** | Ambil dari `GET /api/billing/me` |

---

## 2. Konfigurasi (siapa set apa)

### 2.1 Env backend (sudah diurus tim backend, di `.env`)
```
DUITKU_MERCHANT_CODE=        # dari dashboard sandbox Duitku
DUITKU_API_KEY=              # dari dashboard sandbox Duitku
DUITKU_BASE_URL=https://sandbox.duitku.com
DUITKU_CALLBACK_URL=http://localhost:4000/api/billing/duitku/callback
DUITKU_RETURN_URL=http://localhost:3100/billing/result
```
> Tanpa `DUITKU_MERCHANT_CODE` / `DUITKU_API_KEY`, endpoint `checkout` membalas **503**.

### 2.2 Yang perlu disepakati Frontend ⇄ Backend
- **`DUITKU_RETURN_URL`** harus menunjuk ke **halaman frontend yang benar-benar ada**.
  Contoh di atas: `http://localhost:3100/billing/result`.
  ➡️ **Frontend WAJIB membuat halaman route ini** (lihat bagian 6). Kalau port/ path frontend berbeda, kabari backend agar env disesuaikan.
- **`DUITKU_CALLBACK_URL`** menunjuk ke **backend**, bukan frontend. Frontend tidak perlu menyentuh ini.

### 2.3 Env frontend
Untuk sandbox saat ini frontend **tidak butuh kredensial Duitku apa pun**. Cukup base URL API backend:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
```
> Untuk metode **Popup**, nanti perlu memuat script `checkout.js` dari Duitku — lihat bagian 5. Tetap tidak butuh API key.

---

## 3. Kontrak API yang dipakai Frontend

Semua endpoint (kecuali callback) butuh header `Authorization: Bearer <JWT>`.

### 3.1 `GET /api/billing/plans` — daftar paket
Semua role. Untuk menampilkan pilihan paket.
```json
[
  { "id": "cmqx...", "code": "FREE", "name": "Gratis", "maxRouters": 1, "price": 0, "durationDays": null, "isActive": true },
  { "id": "cmqx...", "code": "STANDARD", "name": "Standar", "maxRouters": 5, "price": 50000, "durationDays": 30, "isActive": true }
]
```

### 3.2 `GET /api/billing/me` — status langganan & kuota
Role **OWNER / TEKNISI** (Teknisi melihat status Owner-nya). **Inilah sumber status paket & lunas.**
```json
{
  "plan": { "code": "STANDARD", "name": "Standar" },
  "maxRouters": 5,
  "used": 1,
  "remaining": 4,
  "expiredAt": "2026-07-29T12:52:04.872Z",
  "expired": false,
  "expiredPlanName": null,
  "subscription": { "id": "cmqx...", "status": "ACTIVE", "plan": { "code": "STANDARD" } }
}
```
Catatan field untuk UI:
- `remaining` = sisa slot router → pakai untuk menonaktifkan tombol "Tambah Router" saat `0`.
- `expired: true` → langganan berbayar sudah lewat masa berlaku; `plan` otomatis turun ke FREE. Tampilkan ajakan **perpanjang** dan gunakan `expiredPlanName` untuk pesannya.

### 3.3 `POST /api/billing/checkout` — mulai pembayaran
Role **OWNER saja**.

**Request**
```json
{ "planCode": "STANDARD" }
```

**Response 201 (sukses)**
```json
{
  "merchantOrderId": "SUB-7ol4lt-1751093818627",
  "reference": "DXXXXYYYYY",
  "paymentUrl": "https://sandbox.duitku.com/topup/v2/...",
  "amount": 50000,
  "plan": "Standar"
}
```
- **Metode Redirect** → gunakan `paymentUrl`.
- **Metode Popup** → gunakan `reference`.
- Simpan `merchantOrderId` untuk keperluan cek status / logging.

**Kemungkinan error (tangani di UI):**

| Kode | Arti | Saran UI |
|:----:|------|----------|
| 400 | Paket gratis tidak perlu bayar | Sembunyikan tombol bayar untuk paket FREE |
| 403 | Bukan Owner (mis. Teknisi) | Sembunyikan tombol upgrade untuk non-Owner |
| 404 | `planCode` tidak ditemukan | Pastikan kirim `code` dari `/plans` (mis. `STANDARD`) |
| 503 | Duitku belum dikonfigurasi | Tampilkan "pembayaran belum tersedia", minta backend cek `.env` |

---

## 4. Alur Metode A — Redirect (paling sederhana, disarankan untuk mulai)

```
[Owner klik Upgrade]
      │
      ▼
POST /api/billing/checkout { planCode: "STANDARD" }
      │  (dapat paymentUrl)
      ▼
window.location.href = paymentUrl      ← pindah ke halaman Duitku
      │
   (Owner bayar di Duitku sandbox)
      │
      ▼
Duitku redirect balik ke DUITKU_RETURN_URL  →  /billing/result
      │
      ▼
Halaman /billing/result → panggil GET /api/billing/me untuk cek status asli
```

Contoh minimal:
```ts
async function upgrade(planCode: string) {
  const { data } = await apiClient.post('/billing/checkout', { planCode });
  // simpan merchantOrderId bila perlu, lalu:
  window.location.href = data.paymentUrl;
}
```

---

## 5. Alur Metode B — Popup (Duitku Pop, pengalaman lebih mulus)

Halaman bayar muncul sebagai jendela melayang tanpa pindah halaman.

1. Muat script Duitku Pop (sandbox) di halaman:
   ```html
   <script src="https://sandbox.duitku.com/lib/js/duitku.js"></script>
   ```
2. Panggil checkout backend untuk mendapat `reference`, lalu proses popup:
   ```ts
   async function upgradePopup(planCode: string) {
     const { data } = await apiClient.post('/billing/checkout', { planCode });
     // @ts-ignore — objek global dari duitku.js
     checkout.process(data.reference, {
       successEvent: () => { /* JANGAN tandai lunas di sini — cek ke backend */ verifyStatus(data.merchantOrderId); },
       pendingEvent: () => { /* tampilkan "menunggu pembayaran" */ },
       errorEvent:   () => { /* tampilkan gagal / minta ulangi */ },
       closeEvent:   () => { /* user menutup popup */ },
     });
   }
   ```
> **Penting:** `successEvent` popup **bukan** bukti lunas yang sah (bisa dipalsukan dari sisi browser). Tetap **konfirmasi via `GET /api/billing/me`** (lihat bagian 6).

---

## 6. Aturan WAJIB: cara menentukan "sudah lunas"

> ⚠️ **Jangan pernah** menandai langganan aktif hanya karena browser kembali dari Duitku atau `successEvent` popup terpanggil. Keduanya terjadi di sisi klien dan bisa dimanipulasi.

**Satu-satunya sumber kebenaran** = backend, yang statusnya di-update oleh **webhook Duitku** (`POST /api/billing/duitku/callback`, sudah divalidasi signature + idempoten).

Pola yang benar di halaman `/billing/result` (atau setelah popup sukses):
```ts
// Polling ringan sampai backend mengonfirmasi (webhook mungkin datang beberapa detik kemudian)
async function verifyStatus(merchantOrderId: string) {
  for (let i = 0; i < 10; i++) {
    const { data } = await apiClient.get('/billing/me');
    if (data.plan.code === 'STANDARD' && !data.expired) {
      return showSuccess(data);      // paket sudah aktif menurut backend
    }
    await new Promise((r) => setTimeout(r, 2000)); // tunggu 2 detik, coba lagi
  }
  showPending(); // belum terkonfirmasi — minta user cek beberapa saat lagi
}
```
> Webhook bisa telat beberapa detik. Kalau setelah polling belum aktif, tampilkan status "menunggu konfirmasi", **bukan** "gagal".

---

## 7. Kartu tes Sandbox

Di halaman pembayaran Duitku sandbox, gunakan channel & data uji yang disediakan Duitku (mis. Virtual Account sandbox, atau kartu kredit uji). Nilai spesifik mengikuti dashboard sandbox milik backend — koordinasikan dengan tim backend. Untuk uji cepat, VA sandbox biasanya paling mudah karena bisa langsung disimulasikan "bayar".

---

## 8. Checklist kesiapan Frontend

- [ ] Halaman daftar paket (`GET /billing/plans`) + kartu status (`GET /billing/me`).
- [ ] Tombol upgrade **hanya untuk role OWNER** (Teknisi/Super Admin tidak lihat).
- [ ] Pilih & implementasi **satu** metode: Redirect (bagian 4) atau Popup (bagian 5).
- [ ] Route halaman **`/billing/result`** ada dan cocok dengan `DUITKU_RETURN_URL`.
- [ ] Status lunas **selalu** dikonfirmasi via `GET /billing/me`, bukan dari return/popup (bagian 6).
- [ ] Tangani error 400/403/404/503 dengan pesan yang jelas (bagian 3.3).
- [ ] `remaining === 0` → nonaktifkan aksi tambah router + arahkan ke upgrade.
- [ ] Kondisi `expired === true` → tampilkan ajakan **perpanjang** memakai `expiredPlanName`.

---

## 9. Yang TIDAK boleh dilakukan Frontend

- ❌ Menyimpan `DUITKU_API_KEY` / `DUITKU_MERCHANT_CODE` di kode frontend.
- ❌ Memanggil `https://sandbox.duitku.com/api/merchant/createInvoice` langsung dari browser.
- ❌ Menghitung/membuat signature Duitku di frontend.
- ❌ Menandai user "sudah berlangganan" tanpa verifikasi ke `GET /billing/me`.
