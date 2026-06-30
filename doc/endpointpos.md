# 📘 Dokumentasi Endpoint API Integrasi POS

> Panduan integrasi untuk sistem kasir (POS). Tinggal ikuti dari atas ke bawah.

---

## 1. Pengenalan API

API Integrasi POS memungkinkan sistem kasir (Point of Sale) kamu **membuat voucher WiFi hotspot secara otomatis** saat transaksi. Setiap permintaan dari POS akan langsung membuat kode voucher baru di router MikroTik, lalu mengembalikan data voucher (kode, QR, tata cara) untuk dicetak di struk.

> **Prinsip penting:**
> - Voucher dibuat **BARU** ke MikroTik saat ada permintaan POS — bukan ambil stok lama.
> - **1 permintaan = 1 voucher.** Mau banyak? Kirim beberapa kali (`transactionId` beda).
> - Kode voucher **digenerate sistem** (6 digit angka). POS tidak perlu menentukan.
> - API key **sudah terikat ke 1 server/outlet** — POS tak perlu kirim Server ID.

---

## 2. API Gateway URL

Semua endpoint POS diawali dengan base URL berikut. Ganti host/port sesuai server produksi kamu saat deploy.

```
http://localhost:4100/api
```

---

## 3. Autentikasi

Setiap permintaan POS **wajib** menyertakan API key pada header `x-api-key`. Buat API key di panel admin (menu **Integrasi POS → Kelola Key**). Key terikat ke 1 outlet.

```http
x-api-key: pos_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `x-api-key` | string | ✅ | API key outlet. Tanpa ini → `401`. |

---

## 4. Endpoint — Daftar Paket WiFi

```http
GET /pos/v1/profiles
```

Mengambil daftar paket (profil hotspot) yang tersedia pada server yang terikat ke API key. Dipakai kasir untuk memilih paket sebelum membuat voucher.

### Headers

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `x-api-key` | string | ✅ | API key outlet. |

### Contoh Permintaan (cURL)

```bash
curl http://localhost:4100/api/pos/v1/profiles \
  -H "x-api-key: pos_xxxxxxxx..."
```

### Contoh Respons — `200 OK`

```json
{
  "servers": [
    {
      "serverId": "cmqa8lvx40009z8us9542d23p",
      "serverName": "Outlet A",
      "profiles": [
        {
          "profileId": "cmqa8lw9u000bz8us0tip6xab",
          "name": "1 Jam",
          "rateLimit": "2M/2M",
          "validity": "1d",
          "sharedUsers": 1
        }
      ]
    }
  ]
}
```

### Deskripsi Respons

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `servers[]` | array | ✅ | Daftar server (berisi 1, milik API key). |
| `serverId` | string | ✅ | ID server. |
| `serverName` | string | ✅ | Nama server/outlet. |
| `profiles[]` | array | ✅ | Daftar paket pada server. |
| `profileId` | string | ✅ | ID paket — dipakai saat trigger voucher. |
| `name` | string | ✅ | Nama paket (mis. `1 Jam`). |
| `rateLimit` | string | ✅ | Batas kecepatan (upload/download). |
| `validity` | string | Opsional | Masa aktif (mis. `1d`). |
| `sharedUsers` | number | ✅ | Jumlah perangkat per voucher. |

---

## 5. Endpoint — Buat Voucher

```http
POST /pos/v1/trigger-voucher
```

Membuat **1 voucher baru** di MikroTik lalu mengembalikan datanya (kode, QR, instruksi) untuk dicetak di struk. **Tidak perlu kirim `serverId`** — sudah ditentukan oleh API key.

### Headers

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `x-api-key` | string | ✅ | API key outlet. |
| `Content-Type` | string | ✅ | `application/json` |

### Body (JSON)

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `transactionId` | string | ✅ | ID transaksi unik dari POS. Kunci idempotensi (cegah voucher dobel). |
| `profileId` | string | ✅ | ID paket yang dipilih kasir (dari endpoint profiles). |
| `outletName` | string | Opsional | Nama outlet — tampil di struk. |
| `customerName` | string | Opsional | Nama pelanggan. |

### Contoh Permintaan (cURL)

```bash
curl -X POST http://localhost:4100/api/pos/v1/trigger-voucher \
  -H "x-api-key: pos_xxxxxxxx..." \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "TRX-POS-001",
    "profileId": "cmqa8lw9u000bz8us0tip6xab",
    "outletName": "Outlet A",
    "customerName": "Budi"
  }'
```

### Contoh Respons — `201 Created`

```json
{
  "transactionId": "TRX-POS-001",
  "voucher": {
    "username": "738142",
    "password": "738142",
    "profileName": "1 Jam",
    "rateLimit": "2M/2M",
    "validity": "1d",
    "loginUrl": "http://hotspot.outletA.com/login?username=738142&password=738142",
    "qrBase64": "data:image/png;base64,iVBORw0KGgo...",
    "instructions": "Sambungkan ke WiFi 'Outlet A' → scan QR atau buka halaman login → masukkan username & password."
  }
}
```

### Deskripsi Respons

| Field | Tipe | Wajib | Keterangan |
|-------|------|:-----:|------------|
| `transactionId` | string | ✅ | Echo `transactionId` dari permintaan. |
| `voucher.username` | string | ✅ | Kode voucher (juga username login). |
| `voucher.password` | string | ✅ | Password login (sama dengan kode). |
| `voucher.profileName` | string | ✅ | Nama paket. |
| `voucher.rateLimit` | string | ✅ | Batas kecepatan. |
| `voucher.validity` | string | Opsional | Masa aktif. |
| `voucher.loginUrl` | string | ✅ | URL halaman login hotspot. |
| `voucher.qrBase64` | string | ✅ | Gambar QR (data URI) — siap dicetak/ditampilkan. |
| `voucher.instructions` | string | ✅ | Tata cara pakai untuk pelanggan. |

> 💡 **Menampilkan QR:** nilai `qrBase64` sudah berupa data URI. Tinggal pakai langsung di `<img src="...">` atau di mesin cetak struk.

---

## 6. Kode Respons

| Kode | Arti |
|:----:|------|
| `200` | `transactionId` sudah pernah diproses — voucher yang sama dikembalikan (idempoten). |
| `201` | Voucher baru berhasil dibuat. |
| `400` | Body tidak valid (mis. `transactionId` kosong). |
| `401` | API key tidak valid / kosong / nonaktif. |
| `403` | API key tidak berhak mengakses server tersebut. |
| `404` | Profil tidak ditemukan pada server. |
| `502` | Router tidak dapat dijangkau saat membuat voucher — coba lagi. |

---

## 7. Alur Integrasi Singkat

| Langkah | Aksi |
|:------:|------|
| **1** | Admin buat **API key** di panel (menu Integrasi POS → Kelola Key). Salin key (tampil sekali). |
| **2** | POS panggil `GET /pos/v1/profiles` → tampilkan daftar paket ke kasir. |
| **3** | Saat transaksi, POS panggil `POST /pos/v1/trigger-voucher` → cetak voucher + QR di struk. |

---

> **Catatan:** Endpoint juga bisa dicoba langsung lewat **Swagger** di `http://localhost:4100/api/docs` (tag **POS** → klik **Authorize** → isi `x-api-key`).
