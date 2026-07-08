# BACKEND.md — Arsitektur Backend

**Proyek:** Web Management WiFi untuk FnB (P5)
**Status dokumen:** mencerminkan kondisi kode hasil audit (in-progress). Terakhir diperbarui **2026-06-29**
(RBAC 3 role, Billing+Duitku, AI Chat widget, manajemen User).

> **Dokumentasi endpoint per-fitur (Method/URL/Payload/Response + hasil uji):**
> [`doc/api/rbac.md`](./api/rbac.md) · [`doc/api/billing.md`](./api/billing.md) · [`doc/api/ai-chat.md`](./api/ai-chat.md).
> Roadmap & status backend lengkap di [`doc/todo_backendp.md`](./todo_backendp.md).

---

## 1. Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Framework | NestJS 11 (TypeScript, **ESM** — import pakai sufiks `.js`) |
| ORM | Prisma 7 + `@prisma/adapter-pg` (driver adapter wajib di Prisma 7) |
| Database | PostgreSQL (port `5433`, DB `wifi_mgmt_db`) |
| Queue | BullMQ + Redis (generate voucher batch) |
| Auth & RBAC | JWT (`@nestjs/jwt` + passport-jwt) + **RolesGuard** (3 role: SUPER_ADMIN / OWNER / TEKNISI) |
| Pembayaran | **Duitku** (Sandbox) — checkout invoice + webhook callback (signature) |
| Integrasi MikroTik | **`routeros-client`** — RouterOS **API binary** (port 8728 / 8729-TLS), mendukung **RouterOS v6 & v7** |
| PDF | `pdfkit` + `qrcode` |
| Keamanan | `helmet`, `@nestjs/throttler`, `bcrypt`, AES-256-GCM (kredensial router) |
| Dokumentasi | Swagger (`@nestjs/swagger`) di `/api/docs` |

Global prefix: **`/api`**. Validasi global via `ValidationPipe` (whitelist + transform).

---

## 2. Struktur Modul

`backend/src/modules/`:

| Modul | Fungsi |
|-------|--------|
| `auth` | Login (JWT, payload `{sub,email,role,ownerId}`), `JwtAuthGuard`, `RolesGuard`, `@Roles()` |
| `users` | Manajemen user (OWNER kelola Teknisi-nya; SUPER_ADMIN kelola semua) |
| `servers` | CRUD server MikroTik, test koneksi (ber-`ownerId`, ter-scope) |
| `profiles` | CRUD hotspot profile + sinkronisasi dari router |
| `vouchers` | Generate single/batch, PDF, bulk delete |
| `monitoring` | User aktif, resource, traffic (real-time via polling) |
| `ai` | Analisis konfigurasi MikroTik via LLM + **AI chat widget kontekstual** |
| `billing` | Paket langganan, kuota router, checkout & webhook **Duitku** |
| `activity-log` | Log aktivitas (paginated) |
| `mikrotik` | Shared (`@Global`) — integrasi RouterOS binary API |
| `prisma` | Shared (`@Global`) — PrismaService |

**RBAC (`src/common/scope.util.ts` + `auth/guards|decorators`):**
- `@Roles(...roles)` + `RolesGuard` → role tak sesuai **403**.
- Scoping data: `serverScopeWhere(user)` = `{}` (SUPER_ADMIN) | `{ ownerId }` (OWNER/TEKNISI);
  `assertOwnerAccess(user, ownerId)` melempar 403 bila akses lintas-owner.
- 3 role: **SUPER_ADMIN** (akses penuh) · **OWNER** (pemilik router + langganan) · **TEKNISI** (operasional router Owner-nya, tak boleh kelola user/billing).

---

## 3. Endpoint yang SUDAH ADA

> Semua terproteksi `JwtAuthGuard` kecuali ditandai **(publik)**. Endpoint ber-role memakai
> `RolesGuard` (role tak sesuai → **403**) dan data ter-scope per Owner.
> **Detail payload/response per endpoint:** `doc/api/{rbac,billing,ai-chat}.md`.

### Auth — `/api/auth`
| Verb | Path | Role | Keterangan |
|------|------|------|------------|
| POST | `/auth/login` | publik | Login → `{accessToken, user:{id,email,name,role,ownerId}}`. Throttle **5/menit/IP** |
| GET | `/auth/me` | semua | Profil user aktif (termasuk `role`) |

### Users — `/api/users`
| Verb | Path | Role | Keterangan |
|------|------|------|------------|
| POST | `/users` | OWNER, SUPER_ADMIN | Buat user (OWNER→Teknisi miliknya; SUPER_ADMIN→Owner/Teknisi). Anti privilege-escalation |
| GET | `/users?role=` | OWNER, SUPER_ADMIN | List user (OWNER hanya Teknisi-nya; SUPER_ADMIN semua) |
| GET | `/users/:id` | OWNER, SUPER_ADMIN | Detail user (ter-scope) |
| PATCH | `/users/:id` | OWNER, SUPER_ADMIN | Update nama/password/aktif (tak bisa nonaktifkan diri sendiri) |
| DELETE | `/users/:id` | OWNER, SUPER_ADMIN | Hapus user (tak bisa hapus diri sendiri) |
> TEKNISI **dilarang** semua endpoint `/users` → 403.

### Servers — `/api/servers`
| Verb | Path | Keterangan |
|------|------|------------|
| POST | `/servers` | Tambah router (password **dienkripsi AES**) |
| GET | `/servers` | List router (password **di-strip** dari response) |
| GET | `/servers/:id` | Detail router |
| PATCH | `/servers/:id` | Update router |
| DELETE | `/servers/:id` | Hapus router (cascade ke profile/voucher) |
| POST | `/servers/:id/test-connection` | Uji koneksi router tersimpan |
| POST | `/servers/test-connection-custom` | Uji koneksi kredensial kustom |

### Profiles — `/api/profiles`
| Verb | Path | Keterangan |
|------|------|------------|
| POST | `/profiles` | Buat profile + sync ke router |
| GET | `/profiles` | List profile |
| GET | `/profiles/:id` | Detail profile |
| PATCH | `/profiles/:id` | Update + resync |
| DELETE | `/profiles/:id` | Hapus profile |
| POST | `/profiles/sync/:serverId` | Tarik profile+voucher dari router (upsert, guard wipe, transaksi) |

### Vouchers — `/api/vouchers`
| Verb | Path | Keterangan |
|------|------|------------|
| POST | `/vouchers/single` | Generate 1 voucher (instan) |
| POST | `/vouchers/batch` | Generate batch (BullMQ background job) |
| POST | `/vouchers/delete-bulk` | Hapus massal (UNUSED) — **partial-safe** |
| GET | `/vouchers` | List voucher |
| GET | `/vouchers/:id` | Detail voucher |
| GET | `/vouchers/pdf/batch/:batchId` | PDF per batch **(publik)** |
| GET | `/vouchers/pdf/single/:id` | PDF single **(publik)** |
| GET | `/vouchers/pdf/filtered?serverId=&profileId=&status=` | PDF terfilter **(publik)** |

### Monitoring — `/api/monitoring`
| Verb | Path | Role | Keterangan |
|------|------|------|------------|
| GET | `/monitoring/snapshot/:serverId` | TEKNISI, SUPER_ADMIN | **Gabungan** active+resource+traffic dalam **1 koneksi** (1 login + 3 perintah) — dipakai auto-refresh dashboard |
| GET | `/monitoring/active/:serverId` | TEKNISI, SUPER_ADMIN | User hotspot aktif |
| GET | `/monitoring/resources/:serverId` | TEKNISI, SUPER_ADMIN | CPU/RAM/HDD/uptime |
| GET | `/monitoring/traffic/:serverId` | OWNER, TEKNISI, SUPER_ADMIN | RX/TX per interface (Owner read-only) |

### AI — `/api/ai`
| Verb | Path | Role | Keterangan |
|------|------|------|------------|
| POST | `/ai/servers/:id/analyze` | TEKNISI, SUPER_ADMIN | Analisis config via LLM. Throttle **10/jam/IP** |
| GET | `/ai/reports` | TEKNISI, SUPER_ADMIN | List laporan AI (ter-scope) |
| GET | `/ai/reports/:id` | TEKNISI, SUPER_ADMIN | Detail laporan |
| DELETE | `/ai/reports` | TEKNISI, SUPER_ADMIN | Hapus semua laporan (ter-scope) |
| DELETE | `/ai/reports/:id` | TEKNISI, SUPER_ADMIN | Hapus satu laporan |
| POST | `/ai/chat` | semua | **AI chat kontekstual** (inject log/konfig router milik user). Throttle **20/menit/IP** |
| GET | `/ai/chat/sessions` | semua | Daftar sesi chat milik user |
| GET | `/ai/chat/sessions/:id` | semua | Detail sesi + riwayat pesan (milik user) |
| DELETE | `/ai/chat/sessions/:id` | semua | Hapus sesi chat (milik user) |
> Chat boleh semua role; konteks & sesi ter-scope ke data milik user. Detail: `doc/api/ai-chat.md`.

### Billing — `/api/billing`
| Verb | Path | Role | Keterangan |
|------|------|------|------------|
| GET | `/billing/plans` | semua | Daftar paket langganan aktif |
| GET | `/billing/me` | OWNER, TEKNISI | Status langganan + pemakaian kuota router |
| POST | `/billing/checkout` | OWNER | Buat invoice upgrade via Duitku → `paymentUrl`. Tanpa kredensial → 503 |
| POST | `/billing/duitku/callback` | **publik** | Webhook Duitku — validasi signature (MD5) + idempoten |
> Kuota router ditegakkan di `POST /servers` (`assertCanAddRouter`) → penuh/kadaluarsa **403**. Detail: `doc/api/billing.md`.

### Activity Log — `/api/activity-log`
| Verb | Path | Role | Keterangan |
|------|------|------|------------|
| GET | `/activity-log?skip=&take=&serverId=&action=` | semua | Log paginated + filter (ter-scope) |

---

## 4. Integrasi MikroTik (`MikrotikService`)

- Library **`routeros-client`** (API binary), mendukung **v6 + v7**.
- Pola koneksi: **connect → write → close** per operasi (stateless).
- Patch `Channel.prototype.processPacket` menangani reply `!empty` RouterOS v7.
- Kredensial per-server diambil dari DB, **didekripsi** (AES-256-GCM) di `getServerCredentials`.
- Port default: `8728` (api) / `8729` (api-ssl bila `useSSL`).

Method utama: `connect`, `testConnection`, `getHotspotProfiles`, `getHotspotUsers`,
`getActiveUsers`, `getSystemResource`, `getInterfaces`, `getFullConfig`, `createHotspotProfile`,
`removeHotspotProfile`, `createHotspotUser`, `removeHotspotUser`,
**`removeHotspotUsersByNames`** (bulk 1-koneksi, partial-safe).

---

## 5. Skema Database (Prisma)

Model (`@@map` ke snake_case jamak, ID `cuid()`):

| Model | Tabel | Inti |
|-------|-------|------|
| `User` | `users` | email unik, password bcrypt, **`role`** (SUPER_ADMIN/OWNER/TEKNISI), `ownerId?` (self-relation Owner↔Teknisi, onDelete Cascade) |
| `MikrotikServer` | `mikrotik_servers` | **`ownerId`** (pemilik=Owner, onDelete Cascade), host, port, username, **password (AES)**, useSSL, lastStatus |
| `HotspotProfile` | `hotspot_profiles` | rateLimit, sessionTimeout, sharedUsers, validity · unik `[serverId,name]` |
| `Voucher` | `vouchers` | username (unik global), password, status, batchId, outletName, expiredAt |
| `AiReport` | `ai_reports` | `userId?`, provider, configJson, resultMd, status |
| `AiChatSession` | `ai_chat_sessions` | `userId` (pemilik), `serverId?`, title — riwayat chat multi-turn |
| `AiChatMessage` | `ai_chat_messages` | `sessionId`, `role` (USER/ASSISTANT), content |
| `ActivityLog` | `activity_logs` | `userId?`, action(enum), entity, detail, ipAddress |
| `Plan` | `plans` | `code` (FREE/STANDARD), name, maxRouters, price, durationDays |
| `Subscription` | `subscriptions` | `userId`, `planId`, status, startedAt, `expiredAt?` — sumber kebenaran kuota |
| `PaymentTransaction` | `payment_transactions` | `merchantOrderId` (unik, idempotensi), amount, status, duitkuReference, paymentUrl, paidAt |
| `PosApiKey` / `PosTransaction` | `pos_api_keys` / `pos_transactions` | skema integrasi POS (modul sedang dibangun ulang oleh rekan tim) |

Enum: `Role`, `ServerStatus`, `VoucherStatus`, `AiReportStatus`, `ChatRole`,
`SubscriptionStatus`, `PaymentStatus`, `PosTxStatus`, `LogAction` (+ aksi billing: `PAYMENT_INITIATED/RECEIVED/FAILED`, `SUBSCRIPTION_ACTIVATED`).

**onDelete:** `User→Teknisi` Cascade · `Owner→MikrotikServer` Cascade · `Server→{Profile,Voucher,AiReport,ChatSession(SetNull)}` ·
`AiChatSession→Message` Cascade · `User→{Subscription,Payment,ChatSession}` Cascade.
Migrasi terkait: `20260627155930_rbac_roles_ownership`, `20260628061332_billing_plans_subscriptions`, `20260629132520_ai_chat_sessions`.

---

## 6. Integrasi POS & Optimasi Lanjut

### 6.1 POS — ✅ **SUDAH ADA** (modul `pos`)

> 📄 **Spesifikasi lengkap (payload, auth API key, skema DB, alur, error, cURL, checklist):
> lihat [`doc/POS_INTEGRATION.md`](./POS_INTEGRATION.md).** Ringkasan implementasi di bawah.

**Tujuan:** sistem kasir (POS) memicu pembuatan voucher otomatis saat transaksi selesai →
response berisi data voucher + QR untuk dicetak di struk.

**Proteksi:** header `x-api-key` (BUKAN JWT). Guard `PosApiKeyGuard`. API key dibuat **per-outlet**
(terikat 1 server), disimpan sebagai hash **sha256** (`PosApiKey.keyHash`), key mentah tampil sekali.

**Endpoint:**

| Verb | Path | Auth | Keterangan |
|------|------|------|------------|
| GET | `/api/pos/v1/profiles` | `x-api-key` | Daftar profil pada server milik API key (POS tak kirim serverId) |
| POST | `/api/pos/v1/trigger-voucher` | `x-api-key` | Trigger 1 voucher (idempoten). Baru → **201**, replay → **200** |
| POST/GET/PATCH/DELETE | `/api/pos-keys[/:id]` | **JWT** | CRUD API key POS (buat/list ter-mask/aktif-nonaktif/revoke) |

**Request body `trigger-voucher`:**
```jsonc
{
  "transactionId": "TRX-POS-2026-001", // unik, kunci idempotensi (cegah dobel voucher)
  "profileId": "cuid-profile",          // ID profile (bukan nama)
  "serverId": "cuid-server",            // OPSIONAL — bila diisi harus = server milik key, else 403
  "outletName": "Kafe A",               // opsional, tampil di struk
  "customerName": "Budi"                // opsional
}
```

**Response** (`{ transactionId, voucher }`):
```jsonc
{
  "transactionId": "TRX-POS-2026-001",
  "voucher": {
    "username": "482913", "password": "482913",
    "profileName": "1k", "rateLimit": "2M/2M", "validity": "1d",
    "loginUrl": "http://<dnsName|host>/login?username=...&password=...",
    "qrBase64": "data:image/png;base64,...",
    "instructions": "Sambungkan ke WiFi ... → scan QR / buka login → masukkan username & password."
  }
}
```

**Perilaku kunci:**
- `serverId` **diturunkan dari API key** (per-outlet); body `serverId` beda → **403**.
- 1 request = **1 voucher** (tanpa `quantity`); voucher **dibuat baru** di router (bukan ambil stok).
- Idempoten via `PosTransaction.transactionId` unik → replay SUCCESS balikkan voucher sama (HTTP 200).
- Router gagal → `PosTransaction(FAILED)` + log `POS_TRANSACTION_RECEIVED` + **502**.
  Sukses → simpan Voucher+PosTransaction **atomik** + log `POS_VOUCHER_GENERATED` (HTTP 201).
- Username numerik unik via `generateNumericCode` (`POS_VOUCHER_CODE_LENGTH`, default 6; password=username).

**Implementasi:** `PosService.triggerVoucher/listProfiles`, `PosKeysService`, `PosApiKeyGuard`,
`MikrotikService.createHotspotUser`. Membuat voucher langsung (tak lewat `VouchersService`).

**Catatan env:** `POS_VOUCHER_CODE_LENGTH` (opsional). Tidak ada `POS_API_KEY` global — key per-outlet di DB.

### 6.2 (Opsional) Monitoring WebSocket/SSE
Monitoring kini **polling** (3-60 dtk). Brief minta "real-time" — terpenuhi via polling, namun
pola **hybrid** (backend polling router + diff → push ke klien via WebSocket/SSE hanya saat berubah)
= optimasi untuk target < 5 detik & kurangi beban. Detail: [`doc/spec/ARSITEKTUR.md`](./spec/ARSITEKTUR.md) §10.1.

---

## 7. Keamanan & Environment

**Sudah aktif:** helmet, throttler (login 5/mnt, AI analyze 10/jam, AI chat 20/mnt, default 100/mnt),
JWT guard + **RolesGuard** (default-deny per role), **scoping per Owner** (anti kebocoran antar-tenant),
AES-256-GCM password router, bcrypt password user, `ValidationPipe` whitelist, CORS dari `FRONTEND_URL`,
webhook Duitku validasi **signature (MD5, `timingSafeEqual`) + idempoten**.

**Env wajib** (`backend/.env`, lihat `.env.example`):
```
DATABASE_URL, REDIS_HOST, REDIS_PORT
JWT_SECRET            # wajib (tanpa fallback — gagal cepat bila kosong)
JWT_EXPIRES_IN       # mis. 7d
MIKROTIK_ENC_KEY     # wajib — 64 char hex (32 byte) untuk enkripsi kredensial
LLM_PROVIDER, OPENROUTER_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
FRONTEND_URL, PORT
DUITKU_MERCHANT_CODE, DUITKU_API_KEY          # kosong → checkout 503 (kuota & callback tetap jalan)
DUITKU_BASE_URL, DUITKU_CALLBACK_URL, DUITKU_RETURN_URL
# POS_API_KEY        # tambahkan saat modul POS dibangun ulang
```

## 8. Command
```bash
cd backend
npm run start:dev      # dev (watch) → http://localhost:<PORT>/api
npm run build
npm run db:migrate     # prisma migrate dev
npm run db:seed        # 3 user seed + 2 paket (lihat di bawah)
npm run db:studio
```

**Akun seed** (`prisma/seed.ts`):

| Email | Password | Role |
|-------|----------|------|
| `admin@wifimanagement.local` | `admin123` | SUPER_ADMIN |
| `owner@wifimanagement.local` | `owner123` | OWNER (langganan FREE) |
| `teknisi@wifimanagement.local` | `teknisi123` | TEKNISI (milik Owner di atas) |

**Paket seed:** `FREE` (Gratis, 1 router) · `STANDARD` (Standar, 5 router, Rp50.000 / 30 hari).
