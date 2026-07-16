# API — Activity Log (Aktivitas & Koneksi Router)

**Modul:** `activity-log` (`ActivityLogService` + `ActivityLogController`).
**Status:** ✅ terverifikasi runtime 2026-07-16.
**Base URL:** `http://localhost:4000/api`

Riwayat aktivitas sistem (audit trail). Dua endpoint **read-only** ter-scope: aktivitas **umum**
satu query builder (pagination + include seragam), dibedakan oleh konstanta `CONNECTION_ACTIONS`.

---

## Konsep

- **ActivityLog** — 1 baris audit: `action` (enum `LogAction`), `userId?`, `serverId?`, `entity?`,
  `entityId?`, `detail?`, `ipAddress?`, `createdAt`. Ditulis oleh service lain via `logAction()`
  (best-effort — gagal tulis log tidak menggagalkan operasi utama).
- **Split koneksi vs umum** — konstanta `CONNECTION_ACTIONS = ['ROUTER_CONNECTION_FAILED']` menjadi
  **satu sumber kebenaran**:
  - `GET /activity-log` (umum) → `where.action = { notIn: CONNECTION_ACTIONS }` (koneksi **dikecualikan**),
    **kecuali** bila query `action` spesifik diberikan (dihormati apa adanya).
  - `GET /activity-log/router-connections` → `where.action = { in: CONNECTION_ACTIONS }` (**hanya** koneksi).
- **Scoping** (`common/scope.util.ts`) — SUPER_ADMIN melihat semua (termasuk log sistem tanpa server);
  OWNER/TEKNISI hanya log dari router milik Owner-nya (`server: serverScopeWhere(user)`).
- **Bentuk respons** — `{ data: ActivityLog[], meta: { total, skip, take } }`, terbaru dulu, setiap entri
  menyertakan `user: {id,name,email,role}` & `server: {id,name,host}`.

### Nilai `LogAction` (enum)

**Koneksi router** (hanya muncul di `/router-connections`):

| Aksi |
|------|
| `ROUTER_CONNECTION_FAILED` |

**Aktivitas umum** (muncul di `/activity-log`):

| Kategori | Aksi |
|----------|------|
| Auth | `ADMIN_LOGIN`, `ADMIN_LOGOUT` |
| Server | `SERVER_CREATED`, `SERVER_UPDATED`, `SERVER_DELETED`, `SERVER_TESTED` |
| Profile | `PROFILE_CREATED`, `PROFILE_UPDATED`, `PROFILE_DELETED`, `PROFILE_SYNCED` |
| Voucher | `VOUCHER_CREATED`, `VOUCHER_BATCH_CREATED`, `VOUCHER_PRINTED`, `VOUCHER_REVOKED`, `VOUCHER_USED` |
| POS | `POS_TRANSACTION_RECEIVED`, `POS_VOUCHER_GENERATED` |
| AI | `AI_ANALYSIS_STARTED`, `AI_ANALYSIS_COMPLETED`, `AI_ANALYSIS_FAILED`, `AI_ANALYSIS_DELETED` |
| Billing | `PAYMENT_INITIATED`, `PAYMENT_RECEIVED`, `PAYMENT_FAILED`, `SUBSCRIPTION_ACTIVATED` |
| Error | `SYSTEM_ERROR` |

> `SYSTEM_ERROR` tergolong umum. Hanya `ROUTER_CONNECTION_FAILED` yang dipisah ke endpoint koneksi.

---

## Matriks Akses

Kedua endpoint butuh JWT (`@Roles('OWNER','TEKNISI','SUPER_ADMIN')`) — read-only, ter-scope.

| Endpoint | SUPER_ADMIN | OWNER | TEKNISI |
|----------|:-:|:-:|:-:|
| `GET /activity-log` | ✅ (semua) | ✅ (miliknya) | ✅ (milik Owner) |
| `GET /activity-log/router-connections` | ✅ (semua) | ✅ (miliknya) | ✅ (milik Owner) |

> OWNER boleh melihat log (mis. riwayat router offline/bermasalah) router miliknya. Data selalu ter-scope
> ke router milik Owner untuk OWNER/TEKNISI; SUPER_ADMIN tanpa filter.

---

## Endpoint

### 1. Aktivitas umum — `GET /api/activity-log`

Butuh JWT (semua role terdaftar). Mengembalikan log **tanpa** aksi koneksi router (default), kecuali
`action` spesifik diminta.

**Query params** (semua opsional):

| Param | Tipe | Default | Keterangan |
|-------|------|---------|------------|
| `skip` | number | `0` | offset pagination |
| `take` | number | `50` | jumlah baris |
| `serverId` | string | — | filter ke satu router |
| `action` | `LogAction` | — | filter aksi spesifik; bila diisi, filter `notIn CONNECTION_ACTIONS` **diabaikan** |

**Response 200 (Success)**
```json
{
  "data": [
    {
      "id": "cmr...",
      "action": "AI_ANALYSIS_COMPLETED",
      "userId": null,
      "serverId": "cmqx...",
      "entity": "AiReport",
      "entityId": "cmr...",
      "detail": "Analisis AI selesai menggunakan provider: gemini",
      "ipAddress": null,
      "createdAt": "2026-07-16T...",
      "user": null,
      "server": { "id": "cmqx...", "name": "CHR-Lab", "host": "192.168.56.101" }
    }
  ],
  "meta": { "total": 22, "skip": 0, "take": 100 }
}
```
> Respons **tidak** memuat entri `ROUTER_CONNECTION_FAILED` (gunakan `/router-connections`).

---

### 2. Riwayat koneksi router — `GET /api/activity-log/router-connections`

Butuh JWT (semua role terdaftar). Memfilter **hanya** aksi `CONNECTION_ACTIONS`
(`ROUTER_CONNECTION_FAILED`) — mis. router offline / gagal terhubung. Scoping & bentuk respons identik
dengan endpoint umum.

**Query params** (opsional): `skip` (default `0`), `take` (default `50`), `serverId`.
Tidak ada param `action` (aksi sudah dipatok ke `CONNECTION_ACTIONS`).

**Response 200 (Success)**
```json
{
  "data": [
    {
      "id": "cmr...",
      "action": "ROUTER_CONNECTION_FAILED",
      "serverId": "cmqx...",
      "detail": "Router tidak dapat dihubungi (timeout)",
      "createdAt": "2026-07-16T...",
      "user": null,
      "server": { "id": "cmqx...", "name": "CHR-Lab", "host": "192.168.56.101" }
    }
  ],
  "meta": { "total": 0, "skip": 0, "take": 100 }
}
```
> Saat router sehat, `data` kosong (`meta.total = 0`).

---

## Hasil Uji Runtime (2026-07-16)

Router uji: MikroTik CHR 7.19.3 (`192.168.56.101:8728`, ONLINE). Server `CHR-Lab` (milik owner).
`[NNN]` = HTTP code aktual.

| Skenario | Hasil |
|----------|-------|
| `GET /activity-log?take=100` admin | **200**, 22 entri, **TANPA** `ROUTER_CONNECTION_FAILED`. Contoh aksi: `SERVER_CREATED`, `VOUCHER_CREATED`, `VOUCHER_BATCH_CREATED`, `POS_VOUCHER_GENERATED`, `POS_TRANSACTION_RECEIVED`, `AI_ANALYSIS_COMPLETED`, `PAYMENT_RECEIVED`, `SUBSCRIPTION_ACTIVATED` |
| `GET /activity-log/router-connections?take=100` admin | **200** (memfilter hanya aksi koneksi `ROUTER_CONNECTION_FAILED`; 0 saat router sehat) |
| Scoping | OWNER/TEKNISI hanya log router miliknya; SUPER_ADMIN semua |
