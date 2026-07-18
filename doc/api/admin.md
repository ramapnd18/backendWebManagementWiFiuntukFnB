# API — Admin (Kelola Owner)

**Modul:** `admin` (`AdminController` + `AdminService`, `backend/src/modules/admin/`).
**Status:** ✅ terverifikasi runtime 2026-07-18 (backend dev + PostgreSQL/Redis Docker).
**Base URL:** `http://localhost:4000/api` · **Auth:** JWT Bearer · **Role:** `SUPER_ADMIN`.

Panel Super Admin untuk mengelola **Owner (tenant)**: daftar beragregat + detail. Dipisah dari
`/users` agar endpoint user tetap ramping (sesuai saran FE).

> Sumber kebutuhan: [`../2026-07-17-peta-endpoint-backend-untuk-frontend.md`](../2026-07-17-peta-endpoint-backend-untuk-frontend.md) (A1/A2).

---

## Endpoint

| Verb | Path | Fungsi |
|------|------|--------|
| GET | `/admin/owners?skip=&take=&search=&planCode=` | Daftar Owner + agregat |
| GET | `/admin/owners/:id` | Detail Owner (langganan, kuota, monitoring) |

### GET /admin/owners
Query: `skip`, `take`, `search` (nama/email), `planCode?` (filter paket langganan aktif).

```jsonc
{
  "data": [
    {
      "id": "cuid",
      "name": "Budi",
      "email": "budi@toko.com",
      "plan": { "code": "STANDARD", "name": "Standar" },   // null bila tak ada langganan aktif
      "teknisiCount": 3,   // COUNT User role=TEKNISI, ownerId = owner.id
      "routerCount": 2,    // COUNT MikrotikServer ownerId = owner.id
      "posCount": 512,     // COUNT PosTransaction pada server milik owner
      "createdAt": "2026-05-01T..."
    }
  ],
  "meta": { "total": 30, "skip": 0, "take": 10 }
}
```

### GET /admin/owners/:id
```jsonc
{
  "id": "cuid", "name": "Budi", "email": "budi@toko.com", "createdAt": "...",
  "subscription": {
    "plan": { "code": "STANDARD", "name": "Standar", "price": 150000,
              "durationDays": 30, "maxRouters": 5, "maxTeknisi": 3,
              "aiAccess": true, "apiKeyAccess": true },
    "status": "ACTIVE", "startedAt": "...", "expiredAt": "2026-08-01T..."
  },                                     // null bila tak ada langganan aktif
  "usage": {
    "routers":  { "used": 2, "max": 5 },
    "teknisi":  { "used": 3, "max": 3 },
    "aiAccess": true, "apiKeyAccess": true
  },
  "monitoring": {
    "outlets": [ { "serverId": "...", "name": "Outlet A",
                   "lastStatus": "ONLINE", "lastCheckedAt": "..." } ]
  }
}
```

`usage`/`subscription` memakai `BillingService.getEffectiveLimit` + `getActiveSubscription`;
`monitoring.outlets` dari `MikrotikServer.lastStatus/lastCheckedAt` (histori penuh → [`monitoring.md` §Histori Healthcheck](./monitoring.md)).

### Kode status
`200` OK · `403` bukan SUPER_ADMIN · `404` owner tak ditemukan.

---

## Hasil Uji Runtime (2026-07-18)

| Skenario | Verb / Path | Aktor | HTTP | Hasil |
|----------|-------------|-------|:----:|-------|
| Daftar owner + agregat | `GET /admin/owners` | admin | **200** | Owner Demo `teknisiCount:2, routerCount:1, posCount:1`; `meta` benar |
| Detail owner | `GET /admin/owners/:id` | admin | **200** | `subscription` + `usage{routers,teknisi,aiAccess,apiKeyAccess}` + `monitoring.outlets` lengkap |
