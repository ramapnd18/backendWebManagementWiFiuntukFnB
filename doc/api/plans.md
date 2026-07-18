# API — Kelola Plan (Paket Langganan)

**Modul:** `plans` (`PlansController` + `PlansService`, `backend/src/modules/plans/`).
**Status:** ✅ terverifikasi runtime 2026-07-18 (backend dev + PostgreSQL/Redis Docker).
**Base URL:** `http://localhost:4000/api` · **Auth:** JWT Bearer · **Role:** `SUPER_ADMIN`.

Manajemen **penuh** paket langganan untuk Super Admin (termasuk paket non-aktif). Berbeda dari
[`GET /billing/plans`](./billing.md) yang hanya menampilkan paket **aktif** untuk owner saat upgrade.

> Sumber kebutuhan: [`../2026-07-17-peta-endpoint-backend-untuk-frontend.md`](../2026-07-17-peta-endpoint-backend-untuk-frontend.md) (A3).

---

## Perubahan Schema `Plan`

Kolom baru pada model `Plan` (migrasi `20260718112056_plan_features_and_router_health`):

| Field | Tipe | Default | Arti |
|-------|------|---------|------|
| `maxTeknisi` | Int | `0` | Batas jumlah teknisi per Owner |
| `aiAccess` | Boolean | `false` | Akses fitur AI (analisis + chat) |
| `apiKeyAccess` | Boolean | `false` | Boleh membuat POS API key / integrasi |

Field lama tetap: `code`, `name`, `maxRouters`, `price`, `durationDays?`, `isActive`.

**Seed default:** FREE `{maxRouters:1, maxTeknisi:1, aiAccess:false, apiKeyAccess:false}` ·
STANDARD `{maxRouters:5, maxTeknisi:3, aiAccess:true, apiKeyAccess:true}`.

> Pemetaan istilah UI: **Nama**=`name`, **Masa**=`durationDays`, **Harga**=`price`,
> **Akses plan**=`maxRouters`/`maxTeknisi`/`aiAccess`/`apiKeyAccess`.

---

## Endpoint

| Verb | Path | Fungsi |
|------|------|--------|
| GET | `/plans` | List **semua** plan (termasuk `isActive=false`), urut harga naik |
| GET | `/plans/:id` | Detail satu plan |
| POST | `/plans` | Buat plan baru (`code` unik) |
| PATCH | `/plans/:id` | Update partial |
| DELETE | `/plans/:id` | Hapus / non-aktifkan (lihat aturan di bawah) |

### Body POST / PATCH
```jsonc
{
  "code": "STANDARD",       // unik & stabil (huruf besar/angka/underscore)
  "name": "Standar",
  "price": 150000,          // Rupiah (0 = gratis)
  "durationDays": 30,       // null = tanpa kadaluarsa
  "maxRouters": 5,
  "maxTeknisi": 3,
  "aiAccess": true,
  "apiKeyAccess": true,
  "isActive": true          // opsional; default true
}
```
PATCH menerima subset field (partial). Bila `code` diubah, tetap divalidasi unik → bentrok **409**.

### Aturan DELETE
- Paket **masih dipakai** Subscription/PaymentTransaction → **soft-delete** (`isActive=false`).
- Paket **tidak dipakai** → **hard-delete**.
- Paket `FREE` **dilindungi** → **400** (tak boleh dihapus; dipakai fallback kuota).
- Response: `{ "softDeleted": boolean, "plan"?: {...} }`.

### Kode status
`200` OK · `201` dibuat · `400` FREE dihapus · `403` bukan SUPER_ADMIN · `404` tak ditemukan · `409` `code` sudah dipakai.

---

## Penegakan field baru

`maxTeknisi` / `aiAccess` / `apiKeyAccess` ditegakkan lewat `BillingService.getEffectiveLimit`.
Detail titik penegakan (buat teknisi, fitur AI, POS API key) ada di **[`billing.md` §Penegakan limit paket](./billing.md)**.

---

## Hasil Uji Runtime (2026-07-18)

| Skenario | Verb / Path | Aktor | HTTP | Hasil |
|----------|-------------|-------|:----:|-------|
| List (field baru muncul) | `GET /plans` | admin | **200** | FREE & STANDARD dengan `maxTeknisi/aiAccess/apiKeyAccess` |
| Buat paket | `POST /plans` (PREMIUM) | admin | **201** | plan baru dikembalikan |
| Update harga | `PATCH /plans/:id` `{price:300000}` | admin | **200** | `price` terupdate |
| Hapus (tak dipakai) | `DELETE /plans/:id` | admin | **200** | `{softDeleted:false}` |
| Hapus FREE (dilindungi) | `DELETE /plans/<FREE>` | admin | **400** | "Paket FREE tidak boleh dihapus" |
| RBAC (bukan SA) | `GET /plans` | owner | **403** | "tidak punya hak akses" |
