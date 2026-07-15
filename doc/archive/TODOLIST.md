# TODOLIST.md — Milestone 40 Hari Kerja (~8 Minggu)

**Proyek:** Web Management WiFi untuk FnB (P5)
**Status:** disesuaikan dengan **hasil audit kode nyata** (bukan rencana ideal).

**Legenda:**
`[x] Selesai` · `[x] Selesai (sudah diperbaiki)` · `[ ] Dalam Proses` · `[ ] Dalam Optimasi / Perbaikan Bug` · `[ ] Belum Mulai`

**Ringkasan progres:** Minggu 1,3,4,6,7 ✅ · Minggu 2 sebagian (def POS belum) · **Minggu 5 (POS) belum mulai** · Minggu 8 dalam proses.

---

## Minggu 1 — Riset & Lab Setup
- [x] Setup lab MikroTik (CHR) — teruji **v6 6.49.19** & **v7 7.21.4**
- [x] Uji API RouterOS (binary API 8728/8729 via `routeros-client`)
- [x] Pilih & validasi library integrasi (migrasi REST → `routeros-client`, dukung v6+v7)
- [ ] Baca dokumentasi POS dari mentor *(input mentor — di luar kode)*

## Minggu 2 — Desain
- [x] Desain ERD / skema database (6 model Prisma + enum)
- [x] Prompt template untuk AI (persona network expert di `ai.service.ts`)
- [ ] **Definisi endpoint POS** `POST /api/pos/v1/trigger-voucher` — *spec ada di `doc/BACKEND.md §6.1`, implementasi belum* → **Belum Mulai**
- [ ] Wireframe UI *(desain; UI final sudah jalan di kode)*

## Minggu 3 — Auth & Server
- [x] Login admin (JWT) — `POST /auth/login` + guard
- [x] CRUD server MikroTik — `servers.controller.ts`
- [x] Test koneksi API router — `/servers/:id/test-connection` + custom
- [x] *(bonus)* Enkripsi password router AES-256-GCM + strip password dari response

## Minggu 4 — Voucher Engine
- [x] Generate voucher **single** — `/vouchers/single`
- [x] Generate voucher **batch** (BullMQ background) — `/vouchers/batch`
- [x] Manajemen profile (bandwidth/durasi) + sync dari router
- [x] Simpan & cetak **PDF** voucher (pdfkit + QR) — 3 endpoint PDF
- [x] Hapus massal voucher — `/vouchers/delete-bulk`
- [x] **Bug bulk delete timeout → SUDAH DIPERBAIKI** (`removeHotspotUsersByNames`, partial-safe, 1 koneksi)
- [x] **Bug sync P2002 (unique username) → SUDAH DIPERBAIKI** (`syncFromRouter` upsert + guard wipe + transaksi)

## Minggu 5 — Integrasi POS ❌ **BELUM MULAI**
- [ ] Buat modul `pos` (controller + service) — **Belum Mulai**
- [ ] Endpoint `POST /api/pos/v1/trigger-voucher` (proteksi `x-api-key`) — **Belum Mulai**
- [ ] Idempotensi via `transactionId` (model `PosTransaction` / penanda) — **Belum Mulai**
- [ ] Reuse `VouchersService.generateSingle/Batch` → `createHotspotUser` — **Belum Mulai**
- [ ] Simulasi transaksi POS → response data voucher utk struk — **Belum Mulai**
- [ ] Tambah `POS_API_KEY` ke `.env` / `.env.example` — **Belum Mulai**
> Catatan: modul POS lama sudah dihapus dari repo agar dibangun bersih oleh rekan tim.

## Minggu 6 — Monitoring
- [x] User aktif real-time — `/monitoring/active/:serverId` (polling 3-60 dtk)
- [x] Resource router (CPU/RAM/HDD) — `/monitoring/resources/:serverId`
- [x] Traffic interface (RX/TX) — `/monitoring/traffic/:serverId`
- [x] Log aktivitas voucher/sistem — modul `activity-log` (paginated + filter)
- [x] Dashboard monitoring (frontend) — auto-refresh, search, status
- [ ] *(Optimasi opsional)* Ganti polling → **WebSocket/SSE** untuk target < 5 dtk — **Dalam Optimasi**

## Minggu 7 — AI Analisis
- [x] Pull config dari MikroTik — `MikrotikService.getFullConfig()`
- [x] Kirim ke LLM — `ai.service.ts` (4 provider: OpenRouter/Gemini/OpenAI/Anthropic)
- [x] Tampilkan rekomendasi (markdown) — `/ai/reports`, halaman `/ai/[id]`
- [x] Simpan laporan — model `AiReport`
- [x] *(bonus)* Guard `JwtAuthGuard` + throttle 10/jam pada endpoint AI

## Minggu 8 — QA & Demo
- [x] Uji E2E voucher (single/batch) di router v6 & v7
- [x] Uji E2E sync & bulk delete (partial-safe) — konsistensi DB↔router
- [x] Dokumentasi teknis — `doc/BACKEND.md`, `doc/FRONTEND.md`, `doc/TODOLIST.md`
- [ ] Test **end-to-end 1 outlet penuh** (termasuk alur POS) — **Dalam Proses** *(terblok Minggu 5)*
- [ ] Demo ke mentor/stakeholder — **Belum Mulai**
- [ ] *(disarankan)* Rotasi API key LLM sebelum demo publik — **Dalam Proses** *(aksi manual)*

---

## Item Optimasi Lanjutan (di luar timeline inti)
> Diangkat dari audit; bukan blocker MVP, tapi penting untuk skala/produksi.

- [ ] Pagination `GET /vouchers`, `/servers`, `/ai/reports`
- [ ] Cache lookup admin (Redis) saat validasi JWT
- [ ] Tegakkan logika `Voucher.expiredAt` saat redeem
- [ ] Frontend: pakai React Query + react-hook-form (sudah terpasang, belum dipakai)
- [ ] Frontend: pindah JWT ke httpOnly cookie; tambah `error.tsx`
- [ ] Health check endpoint + request logging + `trust proxy`
- [ ] Index DB tambahan (`Voucher.createdAt`, `AiReport.adminId`)

---

## Prioritas Berikutnya
1. **Minggu 5 — Integrasi POS** (`POST /api/pos/v1/trigger-voucher`) — satu-satunya fitur MVP yang belum disentuh.
2. **Minggu 8 — E2E 1 outlet + demo** (terblok oleh POS).
3. Optimasi (WebSocket monitoring, pagination, dst) setelah MVP lengkap.
