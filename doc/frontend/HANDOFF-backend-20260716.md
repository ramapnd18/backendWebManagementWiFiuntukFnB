# Handoff Backend → Frontend (per 2026-07-16)

**Base URL:** `http://localhost:4000/api` · **Swagger:** `/api/docs` · **Auth:** JWT Bearer (`Authorization: Bearer <token>`)

Dokumentasi kontrak lengkap + contoh response ada di [`doc/api/`](../api/) (indeks: [`doc/api/README.md`](../api/README.md)).
Semua endpoint sudah diuji runtime terhadap router MikroTik nyata (CHR 7.19.3).

---

## 🆕 Yang BARU / BERUBAH (perlu aksi frontend)

### 1. Registrasi Owner mandiri
`POST /auth/register` (publik) — body `{ email, password, name }` → **201** `{ accessToken, user }`
(langsung auto-login, sama seperti `/auth/login`). Role otomatis `OWNER` + langganan FREE.
Email dobel → **400** `"Email sudah terdaftar"`. Detail: [`doc/api/rbac.md`](../api/rbac.md).

### 2. Login Google
`POST /auth/google` (publik) — body `{ idToken }` → **200** `{ accessToken, user }`.
- Flow: tombol Google Sign-In di frontend → ambil **ID token** → kirim ke endpoint ini.
- Perlu `GOOGLE_CLIENT_ID` di-set di backend (kalau belum → **400** "belum dikonfigurasi").
  **Client ID Google yang sama** dipakai frontend & backend — koordinasikan.

### 3. Voucher: ringkasan used/unused
`GET /vouchers/stats?serverId=&profileId=` → `{ "UNUSED": 59, "USED": 0, "REVOKED": 0, "EXPIRED": 0, "total": 59 }`.
Cocok untuk kartu/badge dashboard. (Filter list tetap: `GET /vouchers?status=USED|UNUSED`.)

### 4. Riwayat POS (untuk panel admin)
`GET /pos/transactions?skip=&take=&serverId=&status=&search=` (JWT) → `{ data, meta }`.
Tiap item sudah include `server{id,name}`, `profile{id,name}`, `voucher{id,username,status}`.
Ini **beda** dari endpoint mesin kasir (`/pos/v1/*` yang pakai `x-api-key`). Detail: [`doc/api/pos.md`](../api/pos.md).

### 5. Riwayat Aktivitas kini DIPISAH jadi 2 endpoint ⚠️
- `GET /activity-log` → **hanya aktivitas umum** (sekarang **tidak lagi** memuat log koneksi router).
- `GET /activity-log/router-connections` → **khusus** riwayat router offline/gagal koneksi.
- **Aksi frontend:** kalau sebelumnya menampilkan "router offline" dari `/activity-log`,
  sekarang ambil dari endpoint `/router-connections`. Detail: [`doc/api/activity-log.md`](../api/activity-log.md).

---

## 📋 Kontrak umum yang perlu diingat

- **Pagination** seragam: `{ data: [...], meta: { total, skip, take } }` (vouchers, pos/transactions, activity-log).
- **RBAC 3 role:** `SUPER_ADMIN` / `OWNER` / `TEKNISI`. **403** = role tak diizinkan **atau** akses lintas-owner. **401** = token invalid/absen.
  - OWNER = read-only untuk banyak hal (lihat voucher/traffic/riwayat, tapi tak boleh mutasi server/profile/voucher).
  - TEKNISI = operasional router Owner-nya.
- **PDF voucher publik** (tanpa JWT, bisa dibuka langsung di browser): `/vouchers/pdf/single/:id`, `/pdf/batch/:batchId`, `/pdf/filtered`.
- **Kuota router**: `POST /servers` bisa **403** `"Kuota router penuh (1/1)"` untuk paket FREE — tampilkan pesan upgrade.
- **Endpoint yang menyentuh router** (monitoring, test-connection, generate voucher) butuh router ONLINE; router mati → **502**.

---

## 🐛 Perbaikan

- `POST /ai/servers/:id/analyze` sebelumnya **500** bila dipanggil tanpa body → **sudah diperbaiki**.
  Body `{ provider? }` opsional (default `gemini`).

---

## ⚠️ Konfigurasi yang perlu diselaraskan

- **Ketidakcocokan port**: [`FRONTEND.md`](./FRONTEND.md) menyebut frontend memanggil `NEXT_PUBLIC_API_URL`
  default `:4100`, padahal **backend jalan di `:4000`**. Pastikan `.env.local` frontend →
  `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.
- Duitku masih **mode Sandbox**; `POST /billing/checkout` akan **503** kalau kredensial Duitku belum diisi.
  Alur pembayaran detail: [`doc/api/duitku-frontend-guide.md`](../api/duitku-frontend-guide.md).

---

## 📚 Referensi cepat per fitur (`doc/api/`)

| Fitur | File |
|-------|------|
| Auth + registrasi + Google + Users | [`rbac.md`](../api/rbac.md) |
| Servers (router) | [`servers.md`](../api/servers.md) |
| Profiles | [`profiles.md`](../api/profiles.md) |
| Vouchers (+ stats) | [`vouchers.md`](../api/vouchers.md) |
| Monitoring | [`monitoring.md`](../api/monitoring.md) |
| POS (kasir + riwayat) | [`pos.md`](../api/pos.md) · [`pos-test-results.md`](../api/pos-test-results.md) |
| AI (analisis & chat) | [`ai.md`](../api/ai.md) · [`ai-chat.md`](../api/ai-chat.md) |
| Billing / Duitku | [`billing.md`](../api/billing.md) · [`duitku-frontend-guide.md`](../api/duitku-frontend-guide.md) |
| Activity Log (2 endpoint) | [`activity-log.md`](../api/activity-log.md) |
