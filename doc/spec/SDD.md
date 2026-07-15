# SDD — Software Design Document (Backend)

**Produk:** P5 — Web Management WiFi untuk FnB · **Cakupan:** Backend (NestJS API)
**Versi:** 1.0 · **Tanggal:** 2026-07-06
**Referensi:** [`PRD.md`](./PRD.md) · [`SRS.md`](./SRS.md) · [`ARSITEKTUR.md`](./ARSITEKTUR.md) · [`../BACKEND.md`](../BACKEND.md)

---

## 1. Pendahuluan

Dokumen desain rinci backend: struktur modul, model data, alur kunci, guard/scoping, integrasi
eksternal, dan keputusan desain. Berbasis kode aktual (`backend/src`, `prisma/schema.prisma`).

Tech: **NestJS 11** (TypeScript ESM), **Prisma 7** + `@prisma/adapter-pg` + **PostgreSQL**,
**BullMQ + Redis**, **JWT** (passport), **routeros-client** (API binary), **pdfkit + qrcode**,
**Duitku** (billing), **Swagger**. Global prefix `/api`.

---

## 2. Struktur Modul

`backend/src/`:

```
main.ts                 # bootstrap: prefix /api, ValidationPipe, helmet, Swagger, CORS
app.module.ts           # ConfigModule global (5 config), ThrottlerModule, feature modules
config/                 # app, database, jwt, redis, ai
common/
  crypto.util.ts        # AES-256-GCM encrypt/decrypt kredensial router
  scope.util.ts         # serverScopeWhere, effectiveOwnerId, assertOwnerAccess
modules/
  auth/                 # login, JwtStrategy, JwtAuthGuard, RolesGuard, @Roles, @CurrentUser
  users/                # CRUD user (Owner↔Teknisi, Super Admin)
  servers/              # CRUD server MikroTik + test koneksi
  profiles/             # CRUD hotspot profile + sync
  vouchers/             # generate single/batch (BullMQ), PDF, bulk delete
  monitoring/           # active users, resource, traffic
  ai/                   # analyze config + chat widget kontekstual
  billing/              # plans, subscription, kuota, Duitku checkout+callback
  activity-log/         # log paginated
  pos/                  # trigger voucher via x-api-key (per-outlet) + CRUD pos-keys
  mikrotik/  (@Global)  # MikrotikService — integrasi RouterOS binary
  prisma/    (@Global)  # PrismaService
```

Pola per modul: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`.

---

## 3. Model Data (Prisma)

ID `cuid()`, tabel `@@map` snake_case jamak. Ringkasan (skema lengkap: `prisma/schema.prisma`, 406 baris).

### 3.1 Entitas & Relasi Inti

| Model | Tabel | Field inti | Relasi / onDelete |
|-------|-------|-----------|-------------------|
| `User` | `users` | email(unik), password(bcrypt), name, **role**, isActive, `ownerId?` | self-relation Owner↔Teknisi (Cascade); punya servers, logs, aiReports, subscriptions, payments, chatSessions |
| `MikrotikServer` | `mikrotik_servers` | `ownerId`, name, host, port(8728), username, **password(AES)**, useSSL, hotspotName?, dnsName?, lastStatus | owner (Cascade); punya profiles, vouchers, logs, aiReports, posApiKeys, chatSessions |
| `HotspotProfile` | `hotspot_profiles` | serverId, name, rateLimit, sessionTimeout?, idleTimeout?, sharedUsers, validity?, syncedToRouter | server (Cascade); unik `[serverId,name]` |
| `Voucher` | `vouchers` | serverId, profileId, username(unik), password, status, batchId?, outletName?, expiredAt? | server & profile (Cascade) |
| `AiReport` | `ai_reports` | serverId, userId?, provider, configJson, resultMd, status | server (Cascade), user |
| `AiChatSession` | `ai_chat_sessions` | userId, serverId?, title? | user (Cascade), server (SetNull), messages |
| `AiChatMessage` | `ai_chat_messages` | sessionId, role(USER/ASSISTANT), content | session (Cascade) |
| `ActivityLog` | `activity_logs` | userId?, serverId?, action, entity?, detail?, ipAddress? | user, server (SetNull) |
| `Plan` | `plans` | code(unik FREE/STANDARD), name, maxRouters, price, durationDays? | subscriptions, payments |
| `Subscription` | `subscriptions` | userId, planId, status, startedAt, expiredAt? | user (Cascade), plan |
| `PaymentTransaction` | `payment_transactions` | merchantOrderId(unik), userId, planId, amount, status, duitkuReference?, paymentUrl?, paidAt? | user (Cascade), plan |
| `PosApiKey` | `pos_api_keys` | label, serverId, keyHash(unik sha256), prefix, isActive, lastUsedAt? | server (Cascade), transactions |
| `PosTransaction` | `pos_transactions` | transactionId(unik, idempotensi), serverId, profileId, voucherId?, status, outletName?, customerName? | posApiKey |

### 3.2 Enum
`Role`(SUPER_ADMIN/OWNER/TEKNISI) · `ServerStatus`(ONLINE/OFFLINE/UNKNOWN) ·
`VoucherStatus`(UNUSED/USED/REVOKED/EXPIRED) · `AiReportStatus`(PENDING/COMPLETED/FAILED) ·
`ChatRole`(USER/ASSISTANT) · `SubscriptionStatus`(ACTIVE/EXPIRED/CANCELLED) ·
`PaymentStatus`(PENDING/PAID/FAILED/EXPIRED) · `PosTxStatus`(SUCCESS/FAILED) ·
`LogAction`(auth/server/profile/voucher/POS/AI/billing/error).

### 3.3 Migrasi (kronologis)
`init` → `add_hotspot_name_dns_name` → `remove_pos` → `add_ai_deleted_action` →
`add_pos_integration` → `pos_key_per_server` → `rbac_roles_ownership` →
`billing_plans_subscriptions` → `ai_chat_sessions`.

---

## 4. RBAC & Scoping (desain of record)

### 4.1 Komponen
- `@Roles(...roles)` (`auth/decorators/roles.decorator.ts`) — set metadata role wajib.
- `RolesGuard` (`auth/guards/roles.guard.ts`) — baca metadata; role kurang → **403**. Tanpa `@Roles` = cukup JWT.
- `serverScopeWhere(user)` (`common/scope.util.ts`):
  - SUPER_ADMIN → `{}` · OWNER → `{ownerId: user.id}` · TEKNISI → `{ownerId: user.ownerId}`.
- `effectiveOwnerId(user)` — Owner=id, Teknisi=ownerId (untuk set kepemilikan resource baru).
- `assertOwnerAccess(user, ownerId)` — lempar 403 bila akses lintas-owner.

### 4.2 Pola pemakaian controller
```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TEKNISI', 'SUPER_ADMIN')   // Owner → 403
@Post()
create(@CurrentUser() user, @Body() dto) { /* effectiveOwnerId(user) */ }
```

### 4.3 Matriks akses (ringkas)
| Resource | SUPER_ADMIN | OWNER | TEKNISI |
|----------|-------------|-------|---------|
| users | semua | Teknisi miliknya | ❌ 403 |
| servers/profiles/vouchers (mutasi) | ✅ | ❌ 403 (read-only) | ✅ (scoped) |
| monitoring traffic | ✅ | ✅ (scoped, read) | ✅ |
| monitoring active/resources | ✅ | ❌ | ✅ |
| ai analyze/reports | ✅ | ❌ | ✅ |
| ai chat | ✅ | ✅ | ✅ (semua, konteks scoped) |
| billing checkout | — | ✅ | ❌ |
| activity-log | ✅ | ✅ (scoped) | ✅ (scoped) |

---

## 5. Desain Modul & Alur Kunci

### 5.1 Auth
`AuthService.validateUser` (bcrypt compare) → `login()` menandatangani JWT payload
`{sub,email,role,ownerId}`. `JwtStrategy` select+validate `role`,`ownerId`. `@CurrentUser` inject user request.

### 5.2 Servers + MikroTik
- `create`: `assertCanAddRouter(ownerId)` (kuota billing) → cek duplikat host per-owner → simpan
  dengan password **AES-256-GCM** (`crypto.util.ts`) → set `ownerId` via `effectiveOwnerId`.
- `MikrotikService` (`@Global`): library `routeros-client`, pola **connect→write→close** per operasi.
  Kredensial di-decrypt di `getServerCredentials`. Patch `Channel.prototype.processPacket` untuk reply
  `!empty` (RouterOS v7). Port 8728 (api) / 8729 (api-ssl bila `useSSL`).
- Method: `testConnection`, `getHotspotProfiles/Users`, `getActiveUsers`, `getSystemResource`,
  `getInterfaces`, `getFullConfig`, `createHotspotProfile/User`, `removeHotspotProfile/User`,
  `removeHotspotUsersByNames` (bulk 1-koneksi, partial-safe).

### 5.3 Vouchers
- `generateSingle`: buat user hotspot di router + record Voucher (instan).
- `generateBatch`: enqueue **BullMQ** job (Redis) → worker generate N voucher background → tak blok request.
- `deleteBulk`: hapus voucher UNUSED + `removeHotspotUsersByNames` (partial-safe).
- PDF: `pdfkit` + `qrcode`; endpoint PDF **publik** (agar dibuka langsung dari struk/browser).

### 5.4 Profiles Sync
`sync/:serverId`: tarik profile+voucher dari router → **upsert transaksional** dengan guard wipe
(tidak menghapus data bila router balikan kosong/anomali).

### 5.5 AI
- `analyzeServer`: `getFullConfig` → `callLLM()` → simpan `AiReport(resultMd)`. Throttle 10/jam.
- `chat`: `buildChatContext(user)` = ActivityLog(15 terbaru) + daftar router & status + AiReport terakhir
  (2000ch) + konfig live (`getFullConfig`, 4000ch) bila `serverId`. Konteks **hanya** data milik user
  (`serverScopeWhere` + `assertOwnerAccess`). System prompt = persona network expert + konteks + riwayat +
  pertanyaan. Simpan `AiChatSession`+`AiChatMessage` **transaksional setelah** LLM sukses (gagal → tak tersimpan).
  Router offline di-`try/catch` (tak menggagalkan chat). Throttle 20/mnt.
- `callLLM()` dispatch `callGemini/callOpenRouter/callOpenAI/callAnthropic` (default env `LLM_PROVIDER`).

### 5.6 Billing (Duitku)
- Sumber kebenaran kuota = `Subscription` aktif (fallback FREE). `getEffectiveLimit` menandai
  `expired`/`expiredPlanName` bila langganan berbayar lewat masa berlaku.
- `assertCanAddRouter`: tolak eksplisit bila kadaluarsa (didahulukan) lalu cek kuota penuh → 403.
- `checkout` (OWNER): `DuitkuService.createInvoice` (header sig **SHA256** merchantCode+timestamp+apiKey)
  → simpan `PaymentTransaction(PENDING)` → balik `paymentUrl`. Tanpa kredensial → 503.
- `duitku/callback` (publik, form-urlencoded): validasi signature **MD5**(merchantCode+amount+merchantOrderId+apiKey)
  via `timingSafeEqual` → invalid 403. Idempoten (tx PAID → skip). Set PAID+paidAt → expire langganan lama →
  buat `Subscription(ACTIVE, expiredAt=now+durationDays)` → catat `PAYMENT_RECEIVED`,`SUBSCRIPTION_ACTIVATED`.

### 5.7 Monitoring
Endpoint per server memanggil `MikrotikService` langsung (stateless). Empat endpoint:
`active/:serverId`, `resources/:serverId`, `traffic/:serverId` (Owner boleh, read-only), dan
**`snapshot/:serverId`** — menggabungkan ketiganya dalam **1 koneksi** (1 login + 3 perintah) untuk
menekan beban router saat auto-refresh dashboard. Real-time via **polling** klien (3–60 dtk).
Data traffic tidak dipersist. Arah lanjut: pola hybrid push (ARSITEKTUR §10.1).

### 5.8 Activity Log
`ActivityLogService.log(...)` dipanggil service lain. `GET /activity-log` paginated (`skip/take`) +
filter (`serverId`,`action`), ter-scope.

### 5.9 POS (`PosService`, `PosKeysService`)
Modul terimplementasi penuh. Dua permukaan:

**Publik ke mesin kasir** (`@Controller('pos/v1')`, guard `PosApiKeyGuard` via `x-api-key`):
- `GET /pos/v1/profiles` — daftar profil pada server **milik API key** (per-outlet); POS tak kirim `serverId`.
  Response hanya field aman (tanpa host/password).
- `POST /pos/v1/trigger-voucher` — body `{transactionId, profileId, serverId?, outletName?, customerName?}`:
  1. `serverId` diturunkan dari `posApiKey.serverId`; bila body `serverId` beda → **403** (cegah lintas-outlet).
  2. Validasi server & profil (profil harus milik server tsb).
  3. **Idempotensi**: `PosTransaction.transactionId` unik — replay SUCCESS → kembalikan voucher sama, HTTP **200**.
  4. Generate username numerik unik (`generateNumericCode`, panjang `POS_VOUCHER_CODE_LENGTH` default 6; password=username).
  5. `MikrotikService.createHotspotUser` — **gagal → `PosTransaction(FAILED)` + log + 502** (`BadGatewayException`).
  6. Sukses → simpan `Voucher`+`PosTransaction(SUCCESS)` **atomik** (`$transaction`) + log `POS_VOUCHER_GENERATED` → HTTP **201**.
  7. Response berisi `voucher{username,password,profileName,rateLimit,validity,loginUrl,qrBase64,instructions}`
     (loginUrl memakai `server.dnsName || server.host`; QR via `qrcode`).

**Manajemen (JWT)** (`@Controller('pos-keys')`, `JwtAuthGuard`):
- `POST /pos-keys` (key mentah tampil **sekali**, disimpan `keyHash` sha256 + `prefix` ter-mask),
  `GET /pos-keys` (ter-mask), `PATCH /pos-keys/:id` (aktif/nonaktif), `DELETE /pos-keys/:id` (revoke).

Catatan: POS membuat voucher **langsung** (bukan lewat `VouchersService`); 1 request = 1 voucher (tanpa `quantity`).
Detail kontrak endpoint: [`../api/pos.md`](../api/pos.md).

---

## 6. Keamanan (desain)

| Aspek | Mekanisme |
|-------|-----------|
| Auth | JWT Bearer, `JWT_SECRET` wajib (fail-fast), expiry `JWT_EXPIRES_IN` |
| Otorisasi | `RolesGuard` default-deny + scoping per-owner (anti kebocoran tenant) |
| Kredensial router | AES-256-GCM (`MIKROTIK_ENC_KEY` 64-hex), di-strip dari response |
| Password user | bcrypt |
| POS key | sha256 hash + prefix ter-mask |
| Rate limit | `@nestjs/throttler`: login 5/mnt, AI analyze 10/jam, AI chat 20/mnt, default 100/mnt |
| Header | `helmet` |
| CORS | dibatasi `FRONTEND_URL` |
| Webhook | signature MD5 `timingSafeEqual` + idempoten sebelum ubah DB |

---

## 7. Konfigurasi & Environment

`ConfigModule` global memuat: `app`, `database`, `jwt`, `redis`, `ai`.

Env wajib/relevan (`backend/.env`, lihat `.env.example`):
```
DATABASE_URL, REDIS_HOST, REDIS_PORT
JWT_SECRET, JWT_EXPIRES_IN
MIKROTIK_ENC_KEY                 # 64-hex (32 byte)
LLM_PROVIDER, OPENROUTER_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
FRONTEND_URL, PORT
DUITKU_MERCHANT_CODE, DUITKU_API_KEY, DUITKU_BASE_URL, DUITKU_CALLBACK_URL, DUITKU_RETURN_URL
# POS_API_KEY                     # saat modul POS dibangun ulang
```

---

## 8. Keputusan Desain (rationale)

| Keputusan | Alasan |
|-----------|--------|
| `Admin` → `User` + kolom `role` | Lebih bersih untuk 3 role daripada tabel terpisah |
| Owner↔Teknisi self-relation (`ownerId`) | 1 Teknisi : 1 Owner; Owner self-service buat Teknisi |
| Guard per-controller (bukan global) | Endpoint tanpa `@Roles` cukup JWT; config wajib `@Roles` |
| RouterOS **API binary** (bukan REST) | Dukungan v6+v7 & operasi hotspot lengkap via `routeros-client` |
| Kuota dari `Subscription` (normalized) | Sumber kebenaran tunggal; fallback FREE |
| Voucher batch via BullMQ | Hindari blocking request untuk batch besar |
| Konteks AI di-truncate | Batasi biaya/latensi LLM |
| Koneksi router stateless | Sederhana & tahan terhadap koneksi router yang tak stabil |

---

## 9. Pengujian

Hasil uji terdokumentasi: RBAC 45/45 (`../api/rbac-test-results.md`), AI chat 24/24
(`../api/ai-chat-test-results.md`), Billing 33/33 (`../api/billing-test-results.md`).
Fokus: enforcement guard, scoping antar-tenant, idempotensi webhook, efek-samping (gagal LLM tak menyimpan).
