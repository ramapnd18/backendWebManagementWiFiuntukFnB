# Dokumentasi API — Kontrak Endpoint per-Fitur

Kontrak endpoint backend (Method/URL/Payload/Response) + hasil uji runtime.
**Base URL:** `http://localhost:4000/api` · Swagger live: `/api/docs`.

Untuk katalog ringkas seluruh endpoint dalam satu tempat, lihat [`../BACKEND.md`](../BACKEND.md) §3.

## Daftar Dokumen

| Fitur / Modul | Kontrak | Hasil Uji |
|-------|---------|-----------|
| RBAC & Auth (login, registrasi Owner, login Google, `/auth/me`, manajemen `/users`) | [`rbac.md`](./rbac.md) | [`rbac-test-results.md`](./rbac-test-results.md) |
| Servers (CRUD router MikroTik, test koneksi, kuota) | [`servers.md`](./servers.md) | (di dalam `servers.md` §Hasil Uji) |
| Profiles (CRUD hotspot profile + sync router) | [`profiles.md`](./profiles.md) | (di dalam `profiles.md` §Hasil Uji) |
| Vouchers (single/batch, stats used/unused, PDF) | [`vouchers.md`](./vouchers.md) | (di dalam `vouchers.md` §Hasil Uji) |
| Monitoring (snapshot, active, resources, traffic) | [`monitoring.md`](./monitoring.md) | (di dalam `monitoring.md` §Hasil Uji) |
| AI — Analisis konfigurasi & laporan | [`ai.md`](./ai.md) | (di dalam `ai.md` §Hasil Uji) |
| AI Chat Widget (kontekstual, multi-turn) | [`ai-chat.md`](./ai-chat.md) | [`ai-chat-test-results.md`](./ai-chat-test-results.md) |
| Billing, Kuota & Duitku | [`billing.md`](./billing.md) | [`billing-test-results.md`](./billing-test-results.md) |
| Activity Log (aktivitas umum + riwayat koneksi router) | [`activity-log.md`](./activity-log.md) | (di dalam `activity-log.md` §Hasil Uji) |
| Integrasi POS (voucher on-demand + riwayat) | [`pos.md`](./pos.md) | [`pos-test-results.md`](./pos-test-results.md) · [`pos-testing.md`](./pos-testing.md) (panduan manual) |

> Uji runtime terakhir **2026-07-16** dijalankan terhadap router nyata **MikroTik CHR 7.19.3** (RouterOS API binary), backend prod build, PostgreSQL + Redis (Docker).

## Panduan Frontend
- [`duitku-frontend-guide.md`](./duitku-frontend-guide.md) — panduan alur pembayaran Duitku (mode sandbox) untuk tim frontend.
