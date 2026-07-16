# Hasil Uji Endpoint RBAC

**Tanggal uji:** 2026-06-29 (RBAC inti) · **diperbarui 2026-07-16** (registrasi Owner + login Google).
**Lingkungan:** lokal — backend `http://localhost:4000/api` (prod build), PostgreSQL (Docker :5433).
**Metode:** uji black-box via `curl` terhadap server berjalan, membandingkan **HTTP status** aktual vs harapan.
**Cakupan:** Auth (login/registrasi/Google), Manajemen User (A.4), penegakan akses lintas modul (A.3), dan isolasi tenant (scoping).

## Ringkasan

| | |
|---|---|
| Total skenario | **49** |
| ✅ Lulus | **49** |
| ❌ Gagal | **0** |

> Akun uji (seed): SUPER_ADMIN `admin@…/admin123` · OWNER `owner@…/owner123` · TEKNISI `teknisi@…/teknisi123`.
> Data uji tambahan (Owner ke-2, Teknisi, router) dibuat saat tes lalu **dibersihkan**; DB kembali ke kondisi seed.

---

## A. Autentikasi (`/api/auth`)

| Method · Endpoint | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| POST `/auth/login` (kredensial benar) | OWNER | 200 | 200 | ✅ |
| POST `/auth/login` (kredensial benar) | SUPER_ADMIN | 200 | 200 | ✅ |
| POST `/auth/login` (password salah, ≥6 char) | — | 401 | 401 | ✅ |
| POST `/auth/register` (Owner baru) | publik | 201 | 201 | ✅ |
| ↳ role hasil = `OWNER` + auto-login (JWT) | — | OWNER | OWNER | ✅ |
| ↳ langganan `FREE` dibuat otomatis (cek `GET /billing/me`) | — | ada | ada | ✅ |
| POST `/auth/register` (email duplikat) | publik | 400 | 400 | ✅ |
| POST `/auth/google` (tanpa `GOOGLE_CLIENT_ID`) | publik | 400 | 400 | ✅ |
| GET `/auth/me` (token valid) | OWNER | 200 | 200 | ✅ |
| GET `/auth/me` (tanpa token) | — | 401 | 401 | ✅ |

---

## B. Manajemen User (`/api/users` — A.4)

| Method · Endpoint | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| POST `/users` | TEKNISI | 403 | 403 | ✅ |
| POST `/users` (buat Teknisi) | OWNER | 201 | 201 | ✅ |
| ↳ role hasil = `TEKNISI` | — | TEKNISI | TEKNISI | ✅ |
| POST `/users` (minta `role:OWNER`) | OWNER | 201 | 201 | ✅ |
| ↳ role dipaksa `TEKNISI` (anti-escalation) | — | TEKNISI | TEKNISI | ✅ |
| POST `/users` (email duplikat) | OWNER | 400 | 400 | ✅ |
| POST `/users` (buat Owner) | SUPER_ADMIN | 201 | 201 | ✅ |
| POST `/users` (Teknisi tanpa `ownerId`) | SUPER_ADMIN | 400 | 400 | ✅ |
| POST `/users` (buat `SUPER_ADMIN`) | SUPER_ADMIN | 400 | 400 | ✅ |
| GET `/users` | TEKNISI | 403 | 403 | ✅ |
| GET `/users` | OWNER | 200 | 200 | ✅ |
| GET `/users?role=TEKNISI` | SUPER_ADMIN | 200 | 200 | ✅ |
| GET `/users/:id` (Teknisi miliknya) | OWNER | 200 | 200 | ✅ |
| GET `/users/:id` (Owner lain) | OWNER | 403 | 403 | ✅ |
| PATCH `/users/:id` (nonaktifkan Teknisi-nya) | OWNER | 200 | 200 | ✅ |
| PATCH `/users/:id` (nonaktifkan diri sendiri) | OWNER | 400 | 400 | ✅ |
| DELETE `/users/:id` (hapus diri sendiri) | OWNER | 400 | 400 | ✅ |
| DELETE `/users/:id` (hapus Teknisi-nya) | OWNER | 200 | 200 | ✅ |

---

## C. Penegakan Akses Lintas Modul (A.3)

| Method · Endpoint | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| GET `/servers` | tanpa token | 401 | 401 | ✅ |
| GET `/servers` | OWNER | 200 | 200 | ✅ |
| GET `/servers` | TEKNISI | 200 | 200 | ✅ |
| GET `/servers` | SUPER_ADMIN | 200 | 200 | ✅ |
| POST `/servers` | OWNER | 403 | 403 | ✅ |
| GET `/profiles` | OWNER | 403 | 403 | ✅ |
| GET `/profiles` | TEKNISI | 200 | 200 | ✅ |
| POST `/vouchers/single` | OWNER | 403 | 403 | ✅ |
| GET `/vouchers` | OWNER | 403 | 403 | ✅ |
| GET `/vouchers` | TEKNISI | 200 | 200 | ✅ |
| GET `/ai/reports` | OWNER | 403 | 403 | ✅ |
| GET `/ai/reports` | TEKNISI | 200 | 200 | ✅ |
| GET `/monitoring/active/:id` | OWNER | 403 | 403 | ✅ |
| GET `/monitoring/traffic/:id` | OWNER | 404¹ | 404 | ✅ |
| GET `/activity-log` | OWNER | 200 | 200 | ✅ |
| GET `/activity-log` | TEKNISI | 200 | 200 | ✅ |

¹ Owner **boleh** akses trafik (role lolos `RolesGuard`); 404 karena `serverId` uji tidak ada — membuktikan
role diizinkan (berbeda dari 403 pada `/monitoring/active`). Konektivitas router nyata di luar cakupan uji RBAC.

---

## D. Isolasi Tenant / Scoping

Skenario: TEKNISI (milik OWNER) membuat 1 router → diuji visibilitas oleh OWNER, Owner lain (OWNER2), dan TEKNISI.

| Method · Endpoint | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| POST `/servers` (buat router) | TEKNISI | 201 | 201 | ✅ |
| GET `/servers` (lihat router miliknya) | OWNER | 1 router | 1 | ✅ |
| GET `/servers` (router milik Owner lain) | OWNER2 | 0 router | 0 | ✅ |
| GET `/servers/:id` (router milik Owner-nya) | TEKNISI | 200 | 200 | ✅ |
| GET `/servers/:id` (router Owner lain) | OWNER2 | 403 | 403 | ✅ |
| DELETE `/servers/:id` (router Owner lain) | OWNER2 | 403 | 403 | ✅ |

---

## Bukti (contoh respons)

**Login (OWNER)** — perhatikan `role` & `ownerId` di token payload & body:
```json
{ "accessToken": "<jwt>", "user": { "id": "cmqw…", "email": "owner@wifimanagement.local", "name": "Owner Demo", "role": "OWNER", "ownerId": null } }
```

**GET `/users` (OWNER)** — hanya Teknisi miliknya, semua `role=TEKNISI`, `ownerId` = id Owner:
```json
[
  { "email": "esc@wm.local", "name": "Esc", "role": "TEKNISI", "ownerId": "cmqw…", "isActive": true },
  { "email": "teknisi@wifimanagement.local", "name": "Teknisi Demo", "role": "TEKNISI", "ownerId": "cmqw…", "isActive": true }
]
```

**Body penolakan (403)** — konsisten untuk semua endpoint terlarang:
```json
{ "statusCode": 403, "message": "Anda tidak punya hak akses untuk resource ini", "error": "Forbidden" }
```

---

## Catatan Metodologi

- Endpoint `POST /auth/login` dibatasi **5 req/menit/IP** (anti brute-force). Suite menjaga anggaran ≤5 login;
  storage throttle in-memory di-reset dengan me-restart server sebelum run.
- Password uji "salah" memakai panjang ≥6 char agar lolos validasi DTO dan benar-benar menguji jalur
  autentikasi (401), bukan validasi input (400).
- Endpoint yang memanggil router MikroTik nyata (monitoring, test-connection) diuji **pada lapisan otorisasi
  saja** (403/404), bukan konektivitas perangkat.
- Skrip uji: `scratchpad/rbac_test2.sh` (di luar repo). Hasil ini dihasilkan dari run terakhir: **45/45 lulus**.
