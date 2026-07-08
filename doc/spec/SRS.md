# SRS — Software Requirements Specification (Backend)

**Produk:** P5 — Web Management WiFi untuk FnB · **Cakupan:** Backend (NestJS API)
**Versi:** 1.0 · **Tanggal:** 2026-07-06
**Referensi:** [`PRD.md`](./PRD.md) · [`SDD.md`](./SDD.md) · [`ARSITEKTUR.md`](./ARSITEKTUR.md) · [`../BACKEND.md`](../BACKEND.md)

---

## 1. Pendahuluan

### 1.1 Tujuan
Mendefinisikan kebutuhan fungsional (FR) dan non-fungsional (NFR) backend secara terverifikasi
terhadap kode. Menjadi acuan uji penerimaan (acceptance).

### 1.2 Lingkup
API REST ber-prefix `/api` (Swagger `/api/docs`). Meliputi: auth/RBAC, manajemen user, server
MikroTik, hotspot profile, voucher, monitoring, AI (analisis + chat), billing (Duitku), activity log,
dan (target) integrasi POS.

### 1.3 Definisi
- **Owner** — pemilik router & langganan. **Teknisi** — operator router milik Owner. **Super Admin** — admin global.
- **Scoping** — pembatasan data berdasarkan kepemilikan (`ownerId`).
- **RouterOS API binary** — protokol MikroTik port 8728/8729 (bukan REST).

---

## 2. Deskripsi Umum

### 2.1 Perspektif Produk
Backend adalah layanan stateless (koneksi MikroTik connect→write→close per operasi) di atas
PostgreSQL + Redis. Terintegrasi dengan sistem eksternal: router MikroTik, LLM provider, Duitku, dan mesin POS.

### 2.2 Aktor
| Aktor | Autentikasi |
|-------|-------------|
| SUPER_ADMIN / OWNER / TEKNISI | JWT Bearer (`/auth/login`) |
| Mesin POS | header `x-api-key` (bukan JWT) |
| Duitku (webhook) | signature MD5 pada body callback (tanpa JWT) |

### 2.3 Batasan Umum
- Bahasa Indonesia untuk pesan error, validasi, deskripsi Swagger.
- ESM (import sufiks `.js`), Prisma 7 + driver adapter `@prisma/adapter-pg`.
- Validasi global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform).

---

## 3. Kebutuhan Fungsional (FR)

> Status: ✅ terimplementasi & teruji · ❌ belum. Endpoint mengacu implementasi di [`../BACKEND.md`](../BACKEND.md) §3.

### FR-1 Autentikasi & Profil
| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-1.1 | Login email+password → JWT `{accessToken, user{id,email,name,role,ownerId}}` | `POST /auth/login` | ✅ |
| FR-1.2 | Login dibatasi 5 percobaan/menit/IP | — | ✅ |
| FR-1.3 | Ambil profil user aktif (termasuk role) | `GET /auth/me` | ✅ |
| FR-1.4 | Password user disimpan sebagai bcrypt hash | — | ✅ |

### FR-2 RBAC & Scoping
| ID | Kebutuhan | Status |
|----|-----------|--------|
| FR-2.1 | JWT payload memuat `{sub,email,role,ownerId}` | ✅ |
| FR-2.2 | `RolesGuard` menolak role tidak sesuai → **403** | ✅ |
| FR-2.3 | Data ter-scope: SUPER_ADMIN `{}` global, OWNER `{ownerId:me}`, TEKNISI `{ownerId:me.ownerId}` | ✅ |
| FR-2.4 | Akses lintas-owner ditolak → 403 (bukan 404 leak) | ✅ |
| FR-2.5 | Owner read-only atas config (mutasi server/profile/voucher/ai → 403) | ✅ |

### FR-3 Manajemen User
| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-3.1 | Owner membuat/kelola Teknisi miliknya (role dipaksa TEKNISI, ownerId auto) | `POST/GET/GET:id/PATCH/DELETE /users` | ✅ |
| FR-3.2 | Super Admin membuat Owner/Teknisi (Teknisi wajib ownerId valid); buat SUPER_ADMIN via API ditolak | — | ✅ |
| FR-3.3 | Cegah privilege escalation; tak bisa nonaktif/hapus diri sendiri; email duplikat → 400 | — | ✅ |
| FR-3.4 | TEKNISI dilarang semua endpoint `/users` → 403 | — | ✅ |

### FR-4 Server MikroTik
| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-4.1 | CRUD server; password kredensial **dienkripsi AES-256-GCM** at-rest, di-strip dari response | `POST/GET/GET:id/PATCH/DELETE /servers` | ✅ |
| FR-4.2 | Test koneksi router tersimpan & kredensial kustom | `POST /servers/:id/test-connection`, `/servers/test-connection-custom` | ✅ |
| FR-4.3 | Pembuatan server menegakkan kuota langganan (`assertCanAddRouter`) → penuh/kadaluarsa 403 | — | ✅ |
| FR-4.4 | Hapus server cascade ke profile/voucher/aiReport | — | ✅ |

### FR-5 Hotspot Profile
| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-5.1 | CRUD profile (rateLimit, sessionTimeout, sharedUsers, validity) + sync ke router | `POST/GET/GET:id/PATCH/DELETE /profiles` | ✅ |
| FR-5.2 | Sync tarik profile+voucher dari router (upsert, guard wipe, transaksional) | `POST /profiles/sync/:serverId` | ✅ |
| FR-5.3 | Unik `[serverId, name]` | — | ✅ |

### FR-6 Voucher
| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-6.1 | Generate 1 voucher instan | `POST /vouchers/single` | ✅ |
| FR-6.2 | Generate batch via BullMQ background job | `POST /vouchers/batch` | ✅ |
| FR-6.3 | Hapus massal (status UNUSED), partial-safe | `POST /vouchers/delete-bulk` | ✅ |
| FR-6.4 | List/detail voucher (ter-scope) | `GET /vouchers`, `GET /vouchers/:id` | ✅ |
| FR-6.5 | PDF voucher (batch/single/filtered) dengan QR — **publik by design** | `GET /vouchers/pdf/...` | ✅ |

### FR-7 Monitoring
| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-7.1 | User hotspot aktif | `GET /monitoring/active/:serverId` | ✅ |
| FR-7.2 | Resource CPU/RAM/HDD/uptime | `GET /monitoring/resources/:serverId` | ✅ |
| FR-7.3 | Traffic RX/TX per interface (Owner diizinkan, ter-scope) | `GET /monitoring/traffic/:serverId` | ✅ |
| FR-7.4 | Snapshot gabungan (active+resource+traffic) dalam 1 koneksi router — untuk auto-refresh dashboard | `GET /monitoring/snapshot/:serverId` | ✅ |

### FR-8 AI
| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-8.1 | Analisis config router via LLM → `AiReport` (Markdown); throttle 10/jam/IP | `POST /ai/servers/:id/analyze` | ✅ |
| FR-8.2 | List/detail/hapus laporan AI (ter-scope) | `GET/DELETE /ai/reports[...]` | ✅ |
| FR-8.3 | AI chat kontekstual: inject ActivityLog(15) + daftar router & status + AiReport terakhir + konfig live | `POST /ai/chat`; throttle 20/mnt/IP | ✅ |
| FR-8.4 | Riwayat chat multi-turn; disimpan transaksional **setelah** LLM sukses | `GET/DELETE /ai/chat/sessions[...]` | ✅ |
| FR-8.5 | Konteks & sesi ter-scope ketat ke data milik user (anti-kebocoran) | — | ✅ |

### FR-9 Billing (Duitku)
| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-9.1 | Daftar paket aktif | `GET /billing/plans` | ✅ |
| FR-9.2 | Status langganan + pemakaian kuota (+ `expired`/`expiredPlanName`) | `GET /billing/me` | ✅ |
| FR-9.3 | Checkout upgrade (OWNER) → invoice Duitku → `paymentUrl`; tanpa kredensial → 503 | `POST /billing/checkout` | ✅ |
| FR-9.4 | Webhook callback: validasi signature MD5 + idempoten → set PAID + aktifkan langganan + naikkan kuota | `POST /billing/duitku/callback` (publik) | ✅ |
| FR-9.5 | Owner baru auto langganan FREE | — | ✅ |

### FR-10 Activity Log
| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-10.1 | Log paginated + filter (`skip,take,serverId,action`), ter-scope | `GET /activity-log` | ✅ |

### FR-11 Integrasi POS
Autentikasi via header `x-api-key` (`PosApiKeyGuard`); API key terikat 1 server (per-outlet). Manajemen key via JWT.

| ID | Kebutuhan | Endpoint | Status |
|----|-----------|----------|--------|
| FR-11.1 | List profil WiFi pada server milik API key (POS tak perlu kirim serverId) | `GET /api/pos/v1/profiles` | ✅ |
| FR-11.2 | Trigger voucher; body `{transactionId, profileId, serverId?, outletName?, customerName?}` — 1 request = 1 voucher, dibuat baru di router | `POST /api/pos/v1/trigger-voucher` | ✅ |
| FR-11.3 | Idempoten per `transactionId` unik: replay sukses → voucher sama, HTTP **200** (bukan 201) tanpa buat baru | — | ✅ |
| FR-11.4 | `serverId` diturunkan dari API key; bila body `serverId` beda dari milik key → **403** (cegah lintas-outlet) | — | ✅ |
| FR-11.5 | Response `{transactionId, voucher{username,password,profileName,rateLimit,validity,loginUrl,qrBase64,instructions}}` untuk struk | — | ✅ |
| FR-11.6 | Router tak terjangkau → catat `PosTransaction(FAILED)` + `POS_TRANSACTION_RECEIVED`, balas **502** | — | ✅ |
| FR-11.7 | Sukses → simpan Voucher+PosTransaction atomik + log `POS_VOUCHER_GENERATED` | — | ✅ |
| FR-11.8 | CRUD API key POS (key mentah tampil sekali, disimpan hash sha256, ter-mask) | `POST/GET/PATCH/DELETE /api/pos-keys` (JWT) | ✅ |

> Spesifikasi lengkap POS: [`../POS_INTEGRATION.md`](../POS_INTEGRATION.md).

---

## 4. Kebutuhan Non-Fungsional (NFR)

### NFR-1 Keamanan
| ID | Kebutuhan | Status |
|----|-----------|--------|
| NFR-1.1 | Semua endpoint config terproteksi JWT + RolesGuard (default-deny) | ✅ |
| NFR-1.2 | Kredensial router AES-256-GCM at-rest; `MIKROTIK_ENC_KEY` (64-hex) wajib | ✅ |
| NFR-1.3 | Password user bcrypt | ✅ |
| NFR-1.4 | `helmet` + rate limiting (`@nestjs/throttler`): login 5/mnt, AI analyze 10/jam, AI chat 20/mnt, default 100/mnt | ✅ |
| NFR-1.5 | CORS dibatasi `FRONTEND_URL` | ✅ |
| NFR-1.6 | Webhook Duitku: signature MD5 `timingSafeEqual` + idempoten sebelum ubah DB | ✅ |
| NFR-1.7 | `JWT_SECRET` wajib (fail-fast bila kosong); secret hanya di `.env` | ✅ |
| NFR-1.8 | POS API key disimpan sebagai hash sha256 (`keyHash`) + prefix ter-mask | ✅ (skema) |

### NFR-2 Performa & Skalabilitas
| ID | Kebutuhan | Status |
|----|-----------|--------|
| NFR-2.1 | Voucher batch tidak memblokir request (BullMQ background) | ✅ |
| NFR-2.2 | Bulk delete voucher 1-koneksi router, partial-safe | ✅ |
| NFR-2.3 | Konteks AI di-truncate (report 2000ch, konfig 4000ch, router ≤20, log 15) | ✅ |
| NFR-2.4 | Monitoring real-time (target <5 dtk; saat ini polling 3–60 dtk) | 🟡 |

### NFR-3 Keandalan
| ID | Kebutuhan | Status |
|----|-----------|--------|
| NFR-3.1 | Koneksi router stateless (connect→write→close); offline tak menggagalkan chat (try/catch) | ✅ |
| NFR-3.2 | Sync profile transaksional dengan guard wipe | ✅ |
| NFR-3.3 | Idempotensi pembayaran via `merchantOrderId` unik; POS via `transactionId` unik | ✅ |

### NFR-4 Kompatibilitas
| ID | Kebutuhan | Status |
|----|-----------|--------|
| NFR-4.1 | Dukung RouterOS v6 & v7 (patch reply `!empty`) | ✅ |
| NFR-4.2 | Multi-provider LLM (openrouter/gemini/openai/anthropic) | ✅ |

### NFR-5 Maintainability & Dokumentasi
| ID | Kebutuhan | Status |
|----|-----------|--------|
| NFR-5.1 | Swagger `/api/docs` sinkron dengan controller | ✅ |
| NFR-5.2 | Dokumentasi markdown per-fitur (rbac/billing/ai-chat) + hasil uji | ✅ |
| NFR-5.3 | DTO + class-validator (pesan Indonesia) tiap request body | ✅ |

---

## 5. Aturan Validasi & Error (ringkas)

- Validasi input gagal → **400** (pesan Indonesia).
- Tanpa/expired JWT → **401** (redirect login di frontend).
- Role/kepemilikan tak sesuai → **403** (default-deny, tanpa membocorkan 404).
- Resource tak ditemukan (dalam scope) → **404**.
- Kredensial Duitku kosong saat checkout → **503**.
- Signature webhook invalid → **403**, data tidak diubah.

---

## 6. Ketertelusuran (Traceability)

| PRD | SRS (FR/NFR) | Modul (SDD) |
|-----|--------------|-------------|
| F1 Auth | FR-1, NFR-1.3/1.7 | `auth` |
| F2 RBAC | FR-2, NFR-1.1 | `auth` + `common/scope.util` |
| F3 User | FR-3 | `users` |
| F4 Server | FR-4, NFR-1.2 | `servers` + `mikrotik` |
| F5 Profile | FR-5 | `profiles` + `mikrotik` |
| F6 Voucher | FR-6, NFR-2.1/2.2 | `vouchers` + BullMQ |
| F7 Monitoring | FR-7, NFR-2.4 | `monitoring` |
| F8/F9 AI | FR-8, NFR-2.3 | `ai` |
| F10/F11 Billing | FR-9, NFR-1.6 | `billing` |
| F12 Log | FR-10 | `activity-log` |
| F13 POS | FR-11, NFR-3.3 | `pos` (`PosService`,`PosKeysService`,`PosApiKeyGuard`) |
