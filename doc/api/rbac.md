# API — RBAC & Auth

**Modul:** `auth` + penegakan RBAC lintas modul.
**Status:** ✅ Implementasi A.1–A.4 selesai & terverifikasi runtime.
**Base URL:** `http://localhost:4000/api`
**Hasil uji menyeluruh:** lihat [`doc/api/rbac-test-results.md`](./rbac-test-results.md) — **45/45 skenario lulus** (2026-06-29).

3 role: `SUPER_ADMIN`, `OWNER`, `TEKNISI`. Relasi: 1 OWNER punya banyak TEKNISI
(`User.ownerId`). Router (`MikrotikServer`) dimiliki OWNER; TEKNISI mengakses router milik Owner-nya.

---

## Mekanisme Penegakan

- **Autentikasi:** JWT Bearer. Token memuat `{ sub, email, role, ownerId }`.
- **Guard:** `JwtAuthGuard` (auth) → `RolesGuard` (role). Dipasang `@UseGuards(JwtAuthGuard, RolesGuard)`.
- **`@Roles(...)`** menandai role yang diizinkan per endpoint.
- **Kode status:**
  - `401 Unauthorized` — token tidak ada / tidak valid.
  - `403 Forbidden` — role tidak diizinkan **atau** resource bukan milik user (scoping).
- **Scoping data:** SUPER_ADMIN = semua; OWNER = `ownerId = id`; TEKNISI = `ownerId = ownerId`.

---

## Matriks Akses (terverifikasi)

| Endpoint | SUPER_ADMIN | OWNER | TEKNISI |
|----------|:-:|:-:|:-:|
| `POST /servers`, `PATCH/DELETE /servers/:id`, `*/test-connection`, `refresh-status` | ✅ | ❌ 403 | ✅ |
| `GET /servers`, `GET /servers/:id` | ✅ (semua) | ✅ (miliknya) | ✅ (milik Owner) |
| `* /profiles` (semua) | ✅ | ❌ 403 | ✅ |
| `* /vouchers` (JWT; selain PDF) | ✅ | ❌ 403 | ✅ |
| `GET /vouchers/pdf/*` | publik | publik | publik |
| `GET /monitoring/traffic/:serverId` (TX/RX) | ✅ | ✅ (miliknya) | ✅ |
| `GET /monitoring/active|resources|snapshot/:serverId` | ✅ | ❌ 403 | ✅ |
| `* /ai` (analisis & laporan) | ✅ | ❌ 403 | ✅ |
| `GET /activity-log` (aktivitas umum) & `/activity-log/router-connections` (koneksi router) | ✅ (semua) | ✅ (miliknya) | ✅ |
| `GET /pos/transactions` (riwayat POS) | ✅ (semua) | ✅ (miliknya) | ✅ |
| `* /users` (manajemen user) | ✅ (semua) | ✅ (Teknisi-nya) | ❌ 403 |

> Semua data list/detail otomatis ter-scope: OWNER/TEKNISI hanya melihat resource milik Owner.

---

## Endpoint

### 1. Login

`POST /api/auth/login` — **publik**, throttle 5/menit/IP.

**Request Payload**
```json
{ "email": "owner@wifimanagement.local", "password": "owner123" }
```

**Response 200 (Success)**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cmqwjvtff00017ol4ltjp1wif",
    "email": "owner@wifimanagement.local",
    "name": "Owner Demo",
    "role": "OWNER",
    "ownerId": null
  }
}
```
> ⚠️ Perubahan dari versi lama: key `admin` → **`user`**, kini menyertakan `role` & `ownerId`.

**Response 401 (Error)**
```json
{ "statusCode": 401, "message": "Email atau password salah", "error": "Unauthorized" }
```

> Akun yang **hanya** terdaftar via Google (tanpa password) yang mencoba login password → **401**
> "Akun ini terdaftar via Google. Silakan masuk dengan Google."

---

### 1b. Registrasi mandiri (Owner)

`POST /api/auth/register` — **publik**, throttle 5/menit/IP. Role dipaksa **OWNER** (body tidak boleh
menentukan role). Membuat langganan **FREE** otomatis, lalu **auto-login** (mengembalikan JWT sama seperti login).

**Request Payload**
```json
{ "email": "owner@contoh.com", "password": "rahasia123", "name": "Kafe Kopi Senja" }
```

**Response 201 (Success)** — `{ accessToken, user }` (identik struktur dengan login; `role: "OWNER"`, `ownerId: null`).

**Response 400** — email sudah terdaftar / body tidak valid:
```json
{ "statusCode": 400, "message": "Email sudah terdaftar", "error": "Bad Request" }
```

---

### 1c. Login / Registrasi via Google

`POST /api/auth/google` — **publik**, throttle 10/menit/IP. Frontend melakukan Google Sign-In,
mendapatkan **ID token**, lalu mengirimkannya. Backend memverifikasi token (`google-auth-library`),
mencari user by email (menautkan `googleId`) atau membuat **OWNER baru** (tanpa password, + langganan FREE),
lalu mengembalikan JWT.

**Prasyarat env:** `GOOGLE_CLIENT_ID` (Client ID OAuth 2.0). Bila kosong → **400** "Login Google belum dikonfigurasi".

**Request Payload**
```json
{ "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6..." }
```

**Response 200 (Success)** — `{ accessToken, user }` (sama seperti login).

**Response 401** — token Google tidak valid / email belum terverifikasi.

---

### 2. Profil user aktif

`GET /api/auth/me` — butuh JWT.

**Headers:** `Authorization: Bearer <accessToken>`

**Response 200 (Success)**
```json
{
  "id": "cmqw...",
  "email": "teknisi@wifimanagement.local",
  "name": "Teknisi Demo",
  "role": "TEKNISI",
  "ownerId": "cmqwjvtff00017ol4ltjp1wif",
  "isActive": true,
  "createdAt": "2026-06-27T15:30:00.000Z",
  "updatedAt": "2026-06-27T15:30:00.000Z"
}
```

**Response 401 (Error)**
```json
{ "statusCode": 401, "message": "Anda harus login terlebih dahulu untuk mengakses resource ini", "error": "Unauthorized" }
```

---

## Contoh Penolakan RBAC (403)

OWNER mengakses endpoint konfigurasi teknis:

`POST /api/servers` dengan token OWNER →

**Response 403 (Error)**
```json
{ "statusCode": 403, "message": "Anda tidak punya hak akses untuk resource ini", "error": "Forbidden" }
```

TEKNISI/OWNER mengakses router milik Owner lain (scoping) →

**Response 403 (Error)**
```json
{ "statusCode": 403, "message": "Anda tidak punya akses ke resource ini", "error": "Forbidden" }
```

---

## Akun Seed (dev)

| role | email | password |
|------|-------|----------|
| SUPER_ADMIN | admin@wifimanagement.local | admin123 |
| OWNER | owner@wifimanagement.local | owner123 |
| TEKNISI | teknisi@wifimanagement.local | teknisi123 |

---

## Manajemen User (A.4) — `/api/users`

✅ Implementasi selesai & terverifikasi runtime (2026-06-28).
Guard: `@Roles('OWNER','SUPER_ADMIN')` — **TEKNISI → 403** di seluruh endpoint ini.

Aturan inti:
- **OWNER** hanya membuat/melihat/mengelola **Teknisi miliknya** (`ownerId` otomatis = id Owner; role dipaksa `TEKNISI`).
- **SUPER_ADMIN** membuat OWNER atau TEKNISI (TEKNISI wajib `ownerId` ke user OWNER); melihat semua.
- Membuat `SUPER_ADMIN` via API **ditolak** (400) — super admin hanya dari seed.

### 1. Buat user — `POST /api/users`

**Request Payload (OWNER membuat Teknisi)** — `role`/`ownerId` diabaikan, dipaksa otomatis:
```json
{ "email": "tek2@wm.local", "password": "secret123", "name": "Teknisi 2" }
```

**Request Payload (SUPER_ADMIN membuat Teknisi)**:
```json
{ "email": "tek@wm.local", "password": "secret123", "name": "Teknisi", "role": "TEKNISI", "ownerId": "<id-owner>" }
```

**Response 201 (Success)**
```json
{
  "id": "cmqx...",
  "email": "tek2@wm.local",
  "name": "Teknisi 2",
  "role": "TEKNISI",
  "ownerId": "cmqwjvtff00017ol4ltjp1wif",
  "isActive": true,
  "createdAt": "2026-06-28T...",
  "updatedAt": "2026-06-28T..."
}
```

**Response 400 (Error — email duplikat / role-ownerId invalid)**
```json
{ "statusCode": 400, "message": "Email tek2@wm.local sudah terdaftar", "error": "Bad Request" }
```

**Response 403 (Error — Teknisi mencoba)**
```json
{ "statusCode": 403, "message": "Anda tidak punya hak akses untuk resource ini", "error": "Forbidden" }
```

### 2. Daftar user — `GET /api/users?role=TEKNISI`

`role` opsional (`OWNER` | `TEKNISI`). SUPER_ADMIN = semua; OWNER = hanya Teknisi-nya.

**Response 200 (Success)**
```json
[
  { "id": "cmqx...", "email": "tek2@wm.local", "name": "Teknisi 2", "role": "TEKNISI", "ownerId": "cmqw...", "isActive": true, "createdAt": "...", "updatedAt": "..." }
]
```

### 3. Detail user — `GET /api/users/:id`

OWNER hanya boleh melihat Teknisi-nya / dirinya. Selain itu **403**. Tidak ditemukan → **404**.

### 4. Update user — `PATCH /api/users/:id`

**Request Payload** (semua opsional):
```json
{ "name": "Nama Baru", "password": "passbaru123", "isActive": false }
```
- Tidak mengubah `role`/`ownerId`.
- Menonaktifkan akun sendiri → **400** (`"Anda tidak dapat menonaktifkan akun sendiri"`).

**Response 200 (Success):** objek user (tanpa password).

### 5. Hapus user — `DELETE /api/users/:id`

OWNER hanya boleh menghapus Teknisi-nya. Menghapus diri sendiri → **400**.
Menghapus OWNER (oleh SUPER_ADMIN) **cascade** ke Teknisi + router-nya.

**Response 200 (Success)**
```json
{ "success": true, "message": "User berhasil dihapus" }
```

> Catatan: aksi manajemen user belum ditulis ke `ActivityLog` (belum ada enum `USER_*`).
> Bila perlu audit, tambah enum + migrasi (follow-up kecil).
