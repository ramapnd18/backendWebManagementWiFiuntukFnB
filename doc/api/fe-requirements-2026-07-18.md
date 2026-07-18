# Endpoint Kebutuhan Frontend — Implementasi 2026-07-18

Implementasi dari [`../2026-07-17-peta-endpoint-backend-untuk-frontend.md`](../2026-07-17-peta-endpoint-backend-untuk-frontend.md).
Base URL `http://localhost:4000/api` · Auth JWT Bearer · Pagination seragam `{ data, meta:{ total, skip, take } }`.

Diuji black-box (`curl`) 2026-07-18 terhadap backend dev + PostgreSQL/Redis (Docker). Router uji **CHR-Lab** dalam status OFFLINE saat uji (VM mati) — cukup untuk membuktikan histori healthcheck mencatat hasil OK **maupun** gagal.

---

## Perubahan Schema
- `Plan` **+=** `maxTeknisi Int @default(0)`, `aiAccess Boolean @default(false)`, `apiKeyAccess Boolean @default(false)`.
- Model baru `RouterHealthCheck` (`serverId`, `status`, `latencyMs?`, `checkedAt`) → tabel `router_health_checks`, index `(serverId, checkedAt)`.
- Migrasi: `prisma/migrations/20260718112056_plan_features_and_router_health`.
- Seed default: FREE `{maxTeknisi:1, aiAccess:false, apiKeyAccess:false}`, STANDARD `{maxTeknisi:3, aiAccess:true, apiKeyAccess:true}`.

---

## A3. Kelola Plan — `/plans` (SUPER_ADMIN)
`GET /plans` · `GET /plans/:id` · `POST /plans` · `PATCH /plans/:id` · `DELETE /plans/:id`.

Body POST/PATCH:
```jsonc
{ "code":"STANDARD", "name":"Standar", "price":150000, "durationDays":30,
  "maxRouters":5, "maxTeknisi":3, "aiAccess":true, "apiKeyAccess":true, "isActive":true }
```
- `DELETE` → **soft-delete** (`isActive=false`) bila masih dipakai Subscription/PaymentTransaction; **hard-delete** bila tidak. Paket `FREE` dilindungi (**400**). Response `{ softDeleted: boolean, plan? }`.
- Beda dari `GET /billing/plans` (paket aktif untuk owner).

**Uji:** GET list 200 (field baru muncul) · POST PREMIUM 201 · PATCH price 200 · DELETE (tak dipakai) `{softDeleted:false}` 200 · DELETE FREE **400** · GET sebagai OWNER **403**.

## A1/A2. Kelola Owner — `/admin/owners` (SUPER_ADMIN)
`GET /admin/owners?skip=&take=&search=&planCode=` →
```jsonc
{ "data":[ { "id","name","email", "plan":{"code","name"}|null,
  "teknisiCount","routerCount","posCount","createdAt" } ], "meta":{...} }
```
`GET /admin/owners/:id` → `{ id,name,email,createdAt, subscription:{plan,status,startedAt,expiredAt}|null,
usage:{routers:{used,max},teknisi:{used,max},aiAccess,apiKeyAccess}, monitoring:{outlets:[{serverId,name,lastStatus,lastCheckedAt}]} }`.

**Uji:** list 200 (Owner Demo teknisiCount=2, routerCount=1, posCount=1) · detail 200 (subscription/usage/monitoring lengkap).

## A4. Chart POS harian — `/pos/transactions/stats`
`GET /pos/transactions/stats?groupBy=day&from=&to=&serverId=` (OWNER/TEKNISI/SA, scoped).
- COUNT **semua status** (SUCCESS+FAILED), bucket `date_trunc('day', createdAt)`. Default 30 hari. Tanggal kosong diisi `count:0`.
- Response `{ "data":[ {"date":"2026-07-01","count":42} ] }`.

**Uji:** OWNER 200 (30 baris terisi) · TEKNISI 200 (scoped).

## B1. Langganan Owner — `/billing`
- `GET /billing/me` (OWNER/TEKNISI) **diperluas**: `usage:{ routers:{used,max}, teknisi:{used,max}, aiAccess, apiKeyAccess }` + `plan` kini memuat `maxRouters/maxTeknisi/aiAccess/apiKeyAccess`. Field lama (`maxRouters/used/remaining/expired`) **dipertahankan** (backward-compat).
- `GET /billing/invoices?skip=&take=` (OWNER) dari `PaymentTransaction` →
  `{ data:[{id,merchantOrderId,plan:{code,name},amount,status,paymentMethod,paidAt,createdAt,paymentUrl}], meta }`.

**Uji:** `me` 200 (usage.teknisi `{used:2,max:1}`, flags false) · invoices 200 (`{data:[],meta:{total:0}}`).

## B2. Monitoring Outlet — `/monitoring/health`
- `GET /monitoring/health?serverId=&from=&to=&skip=&take=` (OWNER/TEKNISI/SA, scoped) →
  `{ data:[{id,serverId,serverName,status,latencyMs,checkedAt}], meta }`.
- `GET /monitoring/health/summary?serverId=&days=30` → `{ data:[{date,checks,fails,uptimePct,downtimeMinutes}] }`.
  `downtimeMinutes ≈ (fails/checks)×1440` (independen interval).
- **Scheduler** `ServerHealthScheduler` menulis 1 baris per router tiap tick (default 30s) untuk **setiap** hasil cek (ONLINE & OFFLINE); **retensi** default 30 hari (`HEALTH_RETENTION_DAYS`), prune berkala.

**Uji:** OWNER 200 (histori CHR-Lab tercatat OFFLINE) · summary 200 (`uptimePct`, `downtimeMinutes`) · TEKNISI 200 (scoped).

## B3/B4. Voucher owner & profil — **sudah ada** (verifikasi)
- `GET /vouchers` & `GET /vouchers/stats` sudah `@Roles('OWNER','TEKNISI','SUPER_ADMIN')` (read-only, scoped). **Uji OWNER 200.**
- `GET /auth/me` sudah kembalikan profil lengkap (`id,email,name,role,ownerId,isActive,createdAt,updatedAt`). **Uji 200.**
- `PATCH /users/:id` sudah dukung `{name?, password?, isActive?}` (owner edit dirinya).

---

## Penegakan limit paket baru (enforcement)
Reuse `BillingService.getEffectiveLimit`. Semua → **403** bila melebihi/kadaluarsa/tak termasuk paket. SUPER_ADMIN dilewati.

| Limit | Titik penegakan | Helper |
|-------|-----------------|--------|
| Teknisi | `POST /users` (buat TEKNISI) | `assertCanAddTeknisi(ownerId)` |
| Fitur AI | `POST /ai/servers/:id/analyze`, `POST /ai/chat` | `assertFeatureAccess(ownerId,'aiAccess')` |
| POS API key | `POST /pos-keys` | `assertFeatureAccess(ownerId,'apiKeyAccess')` |

**Uji (owner FREE):** AI chat **403** ("tidak termasuk fitur AI") · POS key **403** ("tidak termasuk pembuatan POS API key") · buat teknisi **403** ("Kuota teknisi penuh (2/1)").
