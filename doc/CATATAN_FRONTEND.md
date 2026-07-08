# Balasan Backend — Tindak Lanjut Audit Frontend (P5)

**Dari:** tim Backend · **Untuk:** tim Frontend · **Tanggal:** 2026-07-08
**Konteks:** menjawab `doc/CATATAN_BACKEND.md` (audit Fase 0–3). Semua temuan **B1–B10 sudah dikerjakan**. B7 (real-time SSE) masih roadmap. Dokumen ini merangkum **apa yang berubah di API** dan **apa yang perlu frontend sesuaikan**.

Base API: `http://localhost:4000/api` · Commit terkait: `6304f20`.

---

## 0. Ringkasan cepat

| # | Temuan | Status | Aksi frontend |
|---|--------|--------|---------------|
| B1 | `/pos-keys` bocor lintas-tenant | ✅ Selesai | Tak ada (otomatis ter-scope) |
| B2 | `/profiles` abaikan `serverId` | ✅ Selesai | Tak ada (sudah kirim `serverId`) |
| B3 | `/vouchers` abaikan `serverId` | ✅ Selesai | Tak ada |
| B6 | `/vouchers` tanpa pagination | ✅ Selesai | ⚠️ **WAJIB** — respons berubah jadi `{ data, meta }` |
| B4 | `lastStatus` basi | ✅ Selesai | Opsional — badge kini segar otomatis |
| B5 | monitoring 500 saat polling | ✅ Selesai | Sesuaikan handling → tangani **502** |
| B8 | OWNER 403 di profiles/vouchers | ✅ Dibuka (read-only) | Tampilkan menu untuk OWNER (GET saja) |
| B9 | `/profiles/sync` balas ringkasan | ✅ Ditambah `profiles` | Opsional — bisa `setQueryData` |
| B10 | `BACKEND.md` usang | ✅ Sudah diperbarui | Tak ada |
| B7 | Real-time < 5 detik | ✅ Selesai (WebSocket) | Ganti polling → WebSocket (lihat §8) |

**Yang WAJIB kalian ubah:** B6 (bentuk respons voucher), B5 (status 502), B8 (menu OWNER). **B7 opsional tapi disarankan** (WebSocket push, ganti polling monitoring). Sisanya otomatis.

---

## 1. ⚠️ BREAKING — `GET /vouchers` sekarang `{ data, meta }` (B3 + B6)

Dulu balas **array polos**. Sekarang **ter-paginasi server-side** (mengikuti pola `/activity-log`):

```jsonc
// DULU
[ { "id": "...", "username": "911492", ... }, ... ]

// SEKARANG
{
  "data": [ { "id": "...", "username": "911492", ... }, ... ],
  "meta": { "total": 120, "skip": 0, "take": 50 }
}
```

### Query param baru (semua opsional)
| Param | Tipe | Default | Guna |
|-------|------|---------|------|
| `serverId` | string | — | filter 1 router (B3) |
| `profileId` | string | — | filter 1 profil |
| `status` | enum `UNUSED\|USED\|REVOKED\|EXPIRED` | — | filter status |
| `search` | string | — | cari `username` / `outletName` (case-insensitive) |
| `skip` | number | `0` | offset pagination |
| `take` | number | `50` | jumlah per halaman |

### Yang perlu frontend lakukan
1. Ubah pembacaan: `res.data` → `res.data.data`, total → `res.data.meta.total`.
2. **Buang paginasi client-side** — pakai `skip`/`take` ke server. Total halaman dari `meta.total`.
3. Filter (`serverId`/`profileId`/`status`/`search`) kirim ke server, jangan filter di JS.
4. **Solusi sementara** kalau belum siap paginasi: kirim `?take=1000` untuk narik "hampir semua" sekali, lalu baca `res.data.data`. (Bukan untuk produksi — hanya jembatan.)

> Contoh: `GET /vouchers?serverId=abc&status=UNUSED&skip=0&take=25`

---

## 2. B1 — `/pos-keys` aman lintas-tenant (CRITICAL, security)

`GET /pos-keys` kini **hanya** mengembalikan key milik router owner yang login. User tenant lain **tak bisa** melihat, menonaktifkan, atau menghapus key outlet orang (dapat `403`/`404`).

- Param opsional baru: `GET /pos-keys?serverId=<id>` untuk filter 1 outlet.
- `POST /pos-keys` menolak (`403`) bila `serverId` bukan router milik owner.
- **Aksi frontend:** tak ada — sudah otomatis. Bila sebelumnya UI menampilkan key semua tenant, sekarang wajar kalau daftarnya menyusut (memang seharusnya).

---

## 3. B2 — `/profiles` hormati `serverId`

`GET /profiles?serverId=<id>` sekarang benar-benar menyaring per-router (dulu abai → tampil semua profil owner). Tanpa `serverId` → semua profil milik owner (perilaku lama tetap ada).

- **Aksi frontend:** tak ada — kalian sudah kirim `serverId`. Ilusi "sync gagal / profil router lain nyampur" hilang.

---

## 4. B4 — Badge status router segar otomatis

Backend kini punya **health scheduler**: ping semua router tiap `SERVER_HEALTH_INTERVAL_MS` (default **30 detik**) dan memperbarui `lastStatus` + `lastCheckedAt` di DB — tanpa perlu "Test Koneksi" manual.

- **Aksi frontend (opsional):** cukup `useQuery` list `/servers` dengan `refetchInterval` (mis. 30s) → badge & "diperiksa Xs lalu" ikut segar. Endpoint manual `refreshAllStatus` tetap ada bila perlu paksa refresh.
- Interval < 30s **tidak** membebani router lebih dari sebelumnya karena poll terpusat 1×.

---

## 5. B5 — Monitoring balas **502**, bukan 500

Saat router tak terjangkau (timeout/koneksi gagal), `/monitoring/snapshot|active|resources|traffic/:serverId` sekarang balas **`502 Bad Gateway`** (bukan `500` mentah).

- **Aksi frontend:** perlakukan **502** = "router sementara tak terhubung" → tampilkan state *disconnected/retry*, **jangan** anggap error fatal aplikasi. Polling boleh lanjut; saat router balik, otomatis `200`.
- `404` = server tak ada, `403` = bukan router kamu — tetap seperti biasa.
- **Catatan:** 502 ini menghentikan spam error, tapi akar intermittent (banyak koneksi RouterOS serentak) baru tuntas di **B7**.

---

## 6. B8 — OWNER boleh **read-only** profiles & vouchers

Sesuai konfirmasi: **OWNER kini boleh GET** `/profiles`, `/profiles/:id`, `/vouchers`, `/vouchers/:id` (ter-scope router miliknya). **Mutasi** (create/update/delete/batch/sync) **tetap** hanya `TEKNISI` & `SUPER_ADMIN`.

- **Aksi frontend:** untuk role OWNER, tampilkan menu/halaman Profiles & Vouchers dalam **mode baca** (sembunyikan tombol buat/edit/hapus). OWNER yang memicu mutasi akan dapat `403`.

---

## 7. B9 — `/profiles/sync/:serverId` sertakan list final

Respons `POST /profiles/sync/:serverId` kini **menambahkan** field `profiles` (daftar profil final setelah sync) di samping ringkasan lama:

```jsonc
{
  "serverId": "...",
  "totalRouterProfiles": 2,
  "importedCount": 2,
  "deletedProfilesCount": 0,
  "importedVouchersCount": 5,
  "usersSynced": true,
  "imported": [ ... ],
  "profiles": [ { "id": "...", "name": "default", ... }, ... ]  // ← BARU
}
```

- **Aksi frontend (opsional):** langsung `setQueryData(['profiles', serverId], res.data.profiles)` → hemat 1 `GET /profiles` setelah sync. Field lama tidak berubah (non-breaking).

---

## 8. B7 — Real-time < 5 detik via **WebSocket** (SUDAH ADA)

Monitoring kini **push lewat WebSocket** (socket.io) — klien **tak perlu polling** lagi. Router
di-poll **terpusat 1× per interval** (default 3 detik, env `MONITORING_POLL_INTERVAL_MS`) hanya
untuk server yang ada subscriber-nya; hasilnya di-*diff*, dan **hanya saat berubah** di-push ke
klien. Berapapun jumlah klien, router cuma di-poll sekali → tak membanting router.

### Koneksi
- **Namespace:** `ws://localhost:4000/monitoring` (socket.io, **bukan** ws mentah).
- **Auth:** kirim JWT saat handshake via `auth.token` (token yang sama dengan REST).
- Gagal auth → server emit `unauthorized` lalu disconnect.

### Client (contoh, `socket.io-client`)
```ts
import { io } from 'socket.io-client'

const socket = io('http://localhost:4000/monitoring', {
  auth: { token: accessToken },           // JWT dari store auth
  transports: ['websocket'],
})

// Pilih router yang sedang dilihat:
socket.emit('subscribe', { serverId })    // ack: { ok: true } / { ok:false, error }

// Terima data (push hanya saat berubah). Snapshot bentuknya SAMA dengan GET /monitoring/snapshot:
socket.on('snapshot', (snap) => {
  // snap = { serverId, activeUsers[], resources{}, traffic[] }
  queryClient.setQueryData(['monitoring', snap.serverId], snap)
})

// Perubahan konektivitas router (dikirim hanya saat transisi):
socket.on('status', (s) => {
  // s = { serverId, connected: boolean, error? }
})

// Saat ganti router / unmount:
socket.emit('unsubscribe', { serverId })  // dan/atau socket.disconnect()
```

### Yang perlu frontend lakukan
1. `pnpm add socket.io-client`.
2. Ganti `refetchInterval` monitoring (snapshot/active/resources/traffic) → **listener WebSocket**.
   Saat `snapshot` masuk, `setQueryData(['monitoring', serverId], snap)`.
3. `subscribe` saat pilih router; `unsubscribe`/`disconnect` saat pindah/unmount.
4. `status.connected === false` → tampilkan badge "router terputus" (setara 502 di §5).
5. Snapshot pertama dikirim otomatis segera setelah `subscribe` (tak perlu request awal).
6. REST `GET /monitoring/*` **tetap ada** sebagai fallback (mis. WS gagal connect).

> Catatan: cache diff saat ini in-memory (single-instance). Kalau nanti backend di-scale
> horizontal (multi-instance), kami pindahkan fan-out ke Redis pub/sub — kontrak klien di atas
> **tidak berubah**.

---

## 9. Checklist untuk frontend

- [ ] **B6** — `GET /vouchers`: baca `res.data.data` + `res.data.meta`, pindah paginasi & filter ke server.
- [ ] **B5** — tangani `502` monitoring sebagai "router disconnected", bukan crash.
- [ ] **B8** — buka menu Profiles & Vouchers (read-only) untuk role OWNER.
- [ ] **B7** — (disarankan) `socket.io-client` ke `/monitoring`, ganti polling monitoring → listener `snapshot`/`status`.
- [ ] **B4** — (opsional) `refetchInterval` pada list `/servers` untuk badge auto-segar.
- [ ] **B9** — (opsional) pakai `profiles` dari respons sync untuk `setQueryData`.

Pertanyaan / butuh contoh payload lebih detail → colek tim backend. 🙌

---

*Disusun tim Backend, menjawab `doc/CATATAN_BACKEND.md`. Perubahan kode ada di commit `6304f20`.*
