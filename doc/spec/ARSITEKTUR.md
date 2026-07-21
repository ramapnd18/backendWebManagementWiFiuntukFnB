# ARSITEKTUR — Arsitektur Sistem (Backend)

**Produk:** P5 — Web Management WiFi untuk FnB · **Cakupan:** Backend (NestJS API)
**Versi:** 1.0 · **Tanggal:** 2026-07-06
**Referensi:** [`PRD.md`](./PRD.md) · [`SRS.md`](./SRS.md) · [`SDD.md`](./SDD.md) · [`../BACKEND.md`](../BACKEND.md)

---

## 1. Gambaran Umum

Backend adalah **monolith modular NestJS** ber-prefix `/api`, stateless terhadap router (koneksi
per operasi), didukung PostgreSQL (data **dan** antrean voucher batch — tabel `voucher_batches`).
Tidak ada message broker/Redis. Terintegrasi 4 sistem eksternal:
router MikroTik, LLM provider, Duitku (pembayaran), dan mesin POS.

---

## 2. Diagram Konteks Sistem

```mermaid
graph TB
    FE[Frontend Next.js]
    POS[Mesin Kasir / POS]
    subgraph Backend["Backend NestJS (/api)"]
        API[REST API + Swagger]
        Q[VoucherBatchWorker<br/>poller in-process]
    end
    DB[(PostgreSQL<br/>+ tabel voucher_batches)]
    MT[Router MikroTik<br/>RouterOS v6/v7]
    LLM[LLM Provider<br/>OpenRouter/Gemini/OpenAI/Anthropic]
    DK[Duitku Sandbox]

    FE -->|JWT Bearer| API
    POS -->|x-api-key| API
    DK -->|webhook callback signed| API
    API -->|INSERT batch PENDING| DB
    Q -->|klaim FOR UPDATE SKIP LOCKED| DB
    Q -->|simpan Voucher| DB
    API -->|API binary 8728/8729| MT
    Q -->|createHotspotUser| MT
    API -->|analyze / chat| LLM
    API -->|createInvoice| DK
```

---

## 3. Lapisan (Layered Architecture)

```
┌───────────────────────────────────────────────┐
│ Presentation   Controller + DTO (class-validator) + Swagger │
├───────────────────────────────────────────────┤
│ Cross-cutting  JwtAuthGuard · RolesGuard · ValidationPipe   │
│                Throttler · helmet · CORS · @CurrentUser      │
├───────────────────────────────────────────────┤
│ Business       Service (scope.util, effectiveOwnerId,        │
│                assertOwnerAccess, buildChatContext, billing)  │
├───────────────────────────────────────────────┤
│ Integration    MikrotikService · DuitkuService · LLM client  │
│                crypto.util (AES-256-GCM) · VoucherBatchWorker │
├───────────────────────────────────────────────┤
│ Data           PrismaService (@prisma/adapter-pg) → Postgres │
└───────────────────────────────────────────────┘
```

Modul `@Global`: `prisma` (PrismaService) & `mikrotik` (MikrotikService) — dipakai lintas modul.
`ConfigModule` global memuat config `app` dan `jwt`.

---

## 4. Komponen & Tanggung Jawab

| Komponen | Tanggung jawab |
|----------|----------------|
| `main.ts` | Bootstrap: prefix `/api`, `ValidationPipe` global, helmet, CORS, Swagger `/api/docs` |
| `auth` | Login JWT, `JwtStrategy`, guard (`JwtAuthGuard`,`RolesGuard`), `@Roles`,`@CurrentUser` |
| `users` | CRUD user, invariant Owner↔Teknisi, anti privilege-escalation |
| `servers` | CRUD router, enkripsi kredensial, test koneksi, penegakan kuota |
| `profiles` | CRUD hotspot profile + sync dari/ke router (transaksional) |
| `vouchers` | Generate single/batch (antrean tabel `voucher_batches` + `VoucherBatchWorker`), status/progres batch, PDF/QR, bulk delete |
| `monitoring` | Active users, resource, traffic (polling) |
| `ai` | Analyze config + chat kontekstual (context builder, multi-provider LLM) |
| `billing` | Plan, Subscription, kuota, Duitku checkout+callback |
| `activity-log` | Pencatatan & query log ter-scope |
| `pos` | Trigger voucher dari POS via API key per-outlet (idempoten) + CRUD `pos-keys` |
| `mikrotik` | Integrasi RouterOS API binary (connect→write→close) |
| `prisma` | Akses DB |

---

## 5. Model Deployment

```mermaid
graph LR
    subgraph Host["Server aplikasi"]
        N[Node.js — NestJS<br/>PORT env]
    end
    PG[(PostgreSQL<br/>:5433 wifi_mgmt_db<br/>+ voucher_batches)]
    N --> PG
    N -. TLS/opsional .-> MT[MikroTik CHR/fisik]
```

- Prasyarat runtime: **PostgreSQL** aktif dan MikroTik dengan **API service aktif**
  (`/ip/service` → `api`/`api-ssl`). **Tidak ada service infra tambahan** (Redis tidak dipakai).
- Proses: `npm run start:dev` (watch) / `npm run build` + `start:prod`.
- `VoucherBatchWorker` berjalan in-process, mem-poll tabel `voucher_batches` tiap
  `VOUCHER_BATCH_POLL_INTERVAL_MS` (default 5000; `0` = nonaktif). Klaim baris memakai
  `FOR UPDATE SKIP LOCKED` sehingga beberapa instance aplikasi aman berjalan bersamaan.

> Catatan teknis: `start:prod` di `package.json` menunjuk `node dist/main` — path benar `node dist/src/main.js` (pre-existing).

---

## 6. Alur Data Kunci

### 6.1 Generate Voucher Batch (async)
```mermaid
sequenceDiagram
    participant C as Client (JWT)
    participant API as VouchersController
    participant W as VoucherBatchWorker
    participant MT as MikroTik
    participant DB as Postgres
    C->>API: POST /vouchers/batch
    API->>DB: INSERT voucher_batches (status PENDING)
    API-->>C: 201 {batchId, status: PENDING}
    loop tiap VOUCHER_BATCH_POLL_INTERVAL_MS
        W->>DB: klaim 1 batch PENDING tertua (FOR UPDATE SKIP LOCKED) → RUNNING
        W->>DB: simpan Voucher (satu per satu) + createdCount
        W->>MT: createHotspotUser per voucher
    end
    W->>DB: status DONE (atau PENDING utk retry, FAILED setelah 3 percobaan)
    C->>API: GET /vouchers/batches/:batchId (progres)
    C->>API: GET /vouchers/pdf/batch/:batchId (publik)
```

Batch `RUNNING` yang tak tersentuh >15 menit (proses mati di tengah) dikembalikan ke `PENDING` oleh
worker agar tidak menggantung selamanya.

### 6.2 Pembayaran Duitku (webhook idempoten)
```mermaid
sequenceDiagram
    participant O as Owner
    participant API as BillingController
    participant DK as Duitku
    O->>API: POST /billing/checkout (JWT)
    API->>DK: createInvoice (SHA256 sig)
    API-->>O: paymentUrl (PaymentTransaction PENDING)
    O->>DK: bayar di paymentUrl
    DK->>API: POST /billing/duitku/callback (MD5 sig)
    API->>API: verifikasi signature + cek idempoten
    API->>API: set PAID → aktifkan Subscription → naikkan kuota
    API-->>DK: 200 OK
```

---

## 7. Keamanan Arsitektural (defense-in-depth)

1. **Edge** — `helmet`, CORS `FRONTEND_URL`, `@nestjs/throttler` (login 5/mnt, AI analyze 10/jam, chat 20/mnt, default 100/mnt).
2. **Autentikasi** — JWT (`JWT_SECRET` fail-fast) untuk user; `x-api-key` (hash sha256) untuk POS; signature MD5 untuk webhook Duitku.
3. **Otorisasi** — `RolesGuard` default-deny + scoping per-owner di service layer (anti kebocoran tenant).
4. **Data at-rest** — kredensial router AES-256-GCM, password user bcrypt.
5. **Integritas transaksi** — idempotensi via `merchantOrderId`/`transactionId` unik; webhook verifikasi sebelum mutasi DB.

---

## 8. Kualitas Atribut (Quality Attributes)

| Atribut | Pendekatan arsitektural |
|---------|-------------------------|
| Skalabilitas | Beban berat (batch) di-offload ke worker antrean-DB (`FOR UPDATE SKIP LOCKED`, aman multi-instance); koneksi router stateless |
| Ketersediaan | Router offline di-`try/catch` (chat/monitoring tak fatal) |
| Keamanan | Lihat §7 (berlapis) |
| Multi-tenancy | Scoping `ownerId` konsisten di semua modul |
| Portabilitas router | Dukungan RouterOS v6 & v7 (patch reply `!empty`) |
| Ekstensibilitas LLM | Dispatch multi-provider (`callLLM`) |
| Observability | `ActivityLog` terpusat + Swagger + progres/kegagalan batch tersimpan permanen di `voucher_batches` (`createdCount`, `errorMessage`) dan bisa ditanya lewat API |

---

## 9. Titik Integrasi Eksternal

| Sistem | Protokol | Auth | Modul |
|--------|----------|------|-------|
| MikroTik | RouterOS API binary (8728/8729-TLS) | Basic (kredensial per-server, AES) | `mikrotik` |
| LLM | HTTPS REST | API key env | `ai` |
| Duitku | HTTPS REST + webhook | signature SHA256/MD5 | `billing` |
| POS | HTTPS REST | `x-api-key` (sha256, per-outlet) | `pos` |
| Frontend | HTTPS REST | JWT Bearer | semua |

---

## 10. Keterbatasan & Arah Lanjut

- **Monitoring** masih polling (target real-time <5 dtk) → kandidat pola **hybrid push** (lihat §10.1).
- **Histori trafik** belum dipersist (hanya realtime).
- `VoucherBatchWorker` in-process → dapat dipisah ke proses worker terdedikasi bila beban naik
  (tak perlu ubah antrean: klaim `FOR UPDATE SKIP LOCKED` sudah aman untuk banyak instance).
- **POS** membuat voucher langsung (tak lewat `VouchersService`) & tanpa `quantity` (1 request = 1 voucher) — konsolidasi jalur voucher bisa jadi peningkatan berikutnya.

### 10.1 Arah Lanjut Monitoring — Pola Hybrid (polling router + push ke klien)

RouterOS API **tidak** mengirim notifikasi otomatis saat traffic/user berubah, sehingga push
end-to-end murni tidak mungkin dari sisi router. Solusi yang direkomendasikan memisah 2 lapis:

| Lapis | Mekanisme | Alasan |
|-------|-----------|--------|
| Backend ↔ MikroTik | **polling terpusat** (1 poller per server, interval X dtk) + **diff** vs snapshot sebelumnya | Router tak bisa push; poll terpusat agar N klien tak menggandakan beban ke router |
| Backend ↔ Klien | **push** via **WebSocket/SSE** — kirim **hanya saat data berbeda** (event-driven) | Latensi <5 dtk, hemat (tak ada response "tidak berubah" berulang) |

```mermaid
sequenceDiagram
    participant MT as MikroTik
    participant P as Backend Poller (per server)
    participant WS as WS/SSE Gateway
    participant C1 as Klien A
    participant C2 as Klien B
    loop tiap X dtk
        P->>MT: getInterfaces / getActiveUsers
        P->>P: diff vs snapshot terakhir
        alt ada perubahan
            P->>WS: emit update
            WS-->>C1: push (real-time)
            WS-->>C2: push (real-time)
        else tak berubah
            P->>P: diam (tak broadcast)
        end
    end
```

**Keuntungan vs polling per-klien saat ini:** beban router konstan (tak naik seiring jumlah klien),
klien menerima update <detik hanya saat benar-benar berubah. **SSE** cukup bila arah data hanya
server→klien (kasus monitoring); **WebSocket** bila butuh 2 arah. Perlu tambahan: Nest WebSocket/SSE
gateway + penyimpanan snapshot terakhir (in-memory) untuk diff.
