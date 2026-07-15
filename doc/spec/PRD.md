# PRD — Product Requirements Document (Backend)

**Produk:** P5 — Web Management WiFi untuk FnB
**Cakupan dokumen:** Backend (NestJS API)
**Versi:** 1.0 · **Tanggal:** 2026-07-06
**Status:** mencerminkan implementasi backend saat ini (RBAC 3 role, Billing+Duitku, AI chat widget) + target POS.

> Dokumen turunan: [`SRS.md`](./SRS.md) (kebutuhan fungsional/non-fungsional), [`SDD.md`](./SDD.md) (desain rinci), [`ARSITEKTUR.md`](./ARSITEKTUR.md) (arsitektur sistem).

---

## 1. Ringkasan Produk

Web management WiFi mirip **Mikhmon** untuk bisnis FnB (kafe/resto). Backend menyediakan API untuk:
membuat & mengelola voucher hotspot MikroTik, mengatur profile bandwidth/durasi, mengelola banyak
server hotspot secara multi-tenant, integrasi POS (transaksi kasir memicu cetak voucher), langganan
berbayar (Duitku), serta layanan AI yang menganalisis konfigurasi router dan chat kontekstual.

### 1.1 Tiga Pilar Produk
1. **Admin panel API** — CRUD server MikroTik, profile, voucher, monitoring real-time.
2. **Integrasi POS** — endpoint dipicu mesin kasir → response berisi data voucher untuk dicetak di struk.
3. **AI service** — tarik konfigurasi MikroTik → LLM → temuan + saran perbaikan, plus AI chat widget kontekstual.

---

## 2. Masalah & Tujuan

| Masalah | Dampak | Solusi produk |
|---------|--------|---------------|
| Kelola voucher hotspot manual di Winbox lambat & rawan salah | Antrean kasir, salah bandwidth | Panel + generate voucher single/batch otomatis |
| Satu operator sulit kelola banyak outlet | Tidak ada isolasi data antar pemilik | Multi-tenant: Owner memiliki router-nya sendiri; Teknisi operasional; Super Admin global |
| Kasir tidak terhubung ke sistem WiFi | Voucher dicetak terpisah dari struk | POS trigger endpoint → voucher menempel di transaksi |
| Misconfig router sulit dideteksi awam | Jaringan lambat/tidak aman | AI menganalisis config + chat tanya-jawab kontekstual |
| Monetisasi & batas pemakaian | Tidak ada kontrol kuota | Billing paket (FREE/STANDARD) + kuota router, bayar via Duitku |

### 2.1 Tujuan Terukur (backend)
- Semua operasi voucher/profile tersinkron ke router MikroTik (RouterOS v6 & v7) via API binary.
- Isolasi data antar-tenant 100% (tidak ada kebocoran lintas Owner).
- Monitoring status/traffic router tersedia (target real-time; saat ini polling 3–60 dtk).
- Endpoint terdokumentasi lengkap (Swagger `/api/docs` + markdown per-fitur).

---

## 3. Persona & Peran (RBAC)

| Persona | Role sistem | Kebutuhan utama |
|---------|-------------|-----------------|
| Pemilik bisnis FnB | **OWNER** | Punya router & langganan; pantau traffic/aktivitas (read-only); kelola akun Teknisi; upgrade paket |
| Teknisi/operator | **TEKNISI** | Operasional router milik Owner: server, profile, voucher, monitoring, analisis AI. Tak boleh kelola user/billing |
| Admin platform | **SUPER_ADMIN** | Akses global semua tenant; kelola Owner & Teknisi |
| Mesin kasir (POS) | *non-user* (API key) | Memicu pembuatan voucher saat transaksi selesai |

Aturan kunci: 1 Teknisi milik 1 Owner (self-relation). Owner membuat akun Teknisi-nya sendiri.

---

## 4. Fitur & Prioritas

Legenda status: ✅ selesai · 🟡 sebagian · ❌ belum.

| # | Fitur | Prioritas | Status |
|---|-------|-----------|--------|
| F1 | Auth JWT + login throttle | Must | ✅ |
| F2 | RBAC 3 role + scoping multi-tenant | Must | ✅ |
| F3 | Manajemen User (Owner↔Teknisi, Super Admin) | Must | ✅ |
| F4 | CRUD Server MikroTik + test koneksi + enkripsi kredensial | Must | ✅ |
| F5 | CRUD Hotspot Profile + sync ke/dari router | Must | ✅ |
| F6 | Voucher single/batch (BullMQ) + PDF/QR + bulk delete | Must | ✅ |
| F7 | Monitoring (user aktif, resource, traffic) | Must | ✅ (polling) |
| F8 | AI analisis konfigurasi router | Must | ✅ |
| F9 | AI chat widget kontekstual (multi-turn) | Should | ✅ |
| F10 | Billing paket + kuota router | Should | ✅ |
| F11 | Pembayaran Duitku (checkout + webhook callback) | Should | ✅ |
| F12 | Activity log (paginated, ter-scope) | Should | ✅ |
| F13 | **Integrasi POS** (trigger voucher idempoten + list profil + CRUD API key) | Must | ✅ |
| F14 | Monitoring WebSocket/SSE (<5 dtk) | Could | ❌ (opsional optimasi) |

---

## 5. User Journey Inti

1. **Onboarding Owner** — Super Admin/registrasi membuat Owner → otomatis langganan FREE (1 router).
2. **Setup router** — Teknisi tambah Server MikroTik (kredensial dienkripsi AES) → test koneksi.
3. **Setup layanan** — buat Hotspot Profile (bandwidth/durasi) → sync ke router.
4. **Operasi harian** — generate voucher single/batch → cetak PDF berisi QR.
5. **Transaksi POS** — kasir (dengan API key per-outlet) kirim transaksi → backend generate voucher baru di router → data voucher + QR balik untuk struk (idempoten per `transactionId`).
6. **Pantau** — monitoring traffic/resource + activity log; Owner lihat read-only.
7. **Analisis** — AI analyze config atau chat kontekstual untuk saran perbaikan.
8. **Upgrade** — Owner checkout paket STANDARD → bayar via Duitku → kuota router naik otomatis via webhook.

---

## 6. Batasan & Asumsi

- MikroTik memakai **RouterOS API binary** (port 8728 / 8729-TLS), bukan REST. Mendukung v6 & v7.
- LLM via provider yang dikonfigurasi (`LLM_PROVIDER`: openrouter/gemini/openai/anthropic); butuh API key.
- Duitku dipakai dalam mode **Sandbox**; tanpa kredensial → checkout mengembalikan 503 (kuota & callback tetap jalan).
- Backend berjalan dengan PostgreSQL + Redis aktif.
- Integrasi POS memakai **API key per-outlet** (`x-api-key`), terikat ke 1 server; POS tak perlu kirim `serverId`.

---

## 7. Metrik Keberhasilan (backend)

- 0 kebocoran data lintas-tenant pada uji scoping (RBAC 45/45, AI chat 24/24, billing 33/33 skenario lulus).
- Setiap endpoint terproteksi memakai `JwtAuthGuard` (+ `RolesGuard` bila ber-role); default-deny.
- Webhook Duitku: 100% validasi signature + idempoten sebelum mengubah DB.
- Voucher batch besar tidak memblokir request (diproses BullMQ background).

---

## 8. Di Luar Cakupan (Backend)

- UI/halaman frontend (dibahas di [`../frontend/FRONTEND.md`](../frontend/FRONTEND.md)).
- Histori trafik TX/RX tersimpan jangka panjang (belum dipersist; monitoring realtime saja).
- Multi-currency / paket dinamis di luar FREE & STANDARD.
- Notifikasi email/WA.

---

## 9. Risiko Terbuka

| Risiko | Mitigasi |
|--------|----------|
| Monitoring polling belum <5 dtk | Opsi WebSocket/SSE sebagai optimasi lanjutan |
| Ketergantungan LLM eksternal (biaya/latensi) | Throttle (analyze 10/jam, chat 20/mnt) + konteks di-truncate |
| Kredensial router sensitif | AES-256-GCM at-rest + `MIKROTIK_ENC_KEY` wajib |
