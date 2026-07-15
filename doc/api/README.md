# Dokumentasi API — Kontrak Endpoint per-Fitur

Kontrak endpoint backend (Method/URL/Payload/Response) + hasil uji runtime.
**Base URL:** `http://localhost:4000/api` · Swagger live: `/api/docs`.

Untuk katalog ringkas seluruh endpoint dalam satu tempat, lihat [`../BACKEND.md`](../BACKEND.md) §3.

## Daftar Dokumen

| Fitur | Kontrak | Hasil Uji |
|-------|---------|-----------|
| RBAC & Auth (login, `/auth/me`, manajemen `/users`) | [`rbac.md`](./rbac.md) | [`rbac-test-results.md`](./rbac-test-results.md) |
| Billing, Kuota & Duitku | [`billing.md`](./billing.md) | [`billing-test-results.md`](./billing-test-results.md) |
| AI Chat Widget (kontekstual, multi-turn) | [`ai-chat.md`](./ai-chat.md) | [`ai-chat-test-results.md`](./ai-chat-test-results.md) |
| Integrasi POS (voucher on-demand) | [`pos.md`](./pos.md) | [`pos-testing.md`](./pos-testing.md) |

## Panduan Frontend
- [`duitku-frontend-guide.md`](./duitku-frontend-guide.md) — panduan alur pembayaran Duitku (mode sandbox) untuk tim frontend.
