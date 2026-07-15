# TODO — Revamp UI Menyeluruh (Ollama-style)

> **Patokan desain:** `doc/DESIGN-ollama.md`
> **Filosofi:** Halaman = dokumen Markdown. Kanvas putih polos (`#ffffff`), warna **hanya** hitam/putih/abu netral, geometri **pill** (`rounded-full`) untuk semua elemen interaktif, kartu `rounded-lg` (12px) + 1px hairline, **tanpa** gradient/shadow/glass. Heading SF Pro Rounded → fallback **Nunito**; body system-sans (Inter); kode **JetBrains Mono**.

---

## ⛔ Batasan Kritis (WAJIB dipatuhi)

- [ ] **JANGAN sentuh `backend/` sama sekali.** Murni frontend. Tidak ubah endpoint, DTO, response shape.
- [ ] **Jangan ubah kontrak data backend.** Hanya konsumsi API yang **sudah ada** apa adanya. Bila field kurang untuk UI baru, **mapping/format di sisi frontend** — bukan minta backend berubah.
- [ ] **Jangan rusak fungsi yang sudah jalan.** Auth flow, JWT interceptor, Zustand store (`auth-store`, `server-store`, `toast-store`), server selector + sync global, polling status 30s tetap hidup.
- [ ] **Scope revamp = 7 modul:** Login, Dashboard, Servers, Profiles, Vouchers, AI Analis, Activity Logs. **Semua** dirombak penuh.

---

## 1) Alur Kerja Perombakan (Workflow) + Alasan Logis

Urutan dipilih agar **fondasi visual jadi dulu**, baru per-halaman, dari yang paling sederhana ke paling kompleks. Tiap modul berikutnya mewarisi komponen/token yang sudah matang → makin cepat & konsisten.

| # | Tahap | Kenapa urutannya begini |
|---|-------|--------------------------|
| **0** | **Design Token + Komponen Dasar** | Sumber kebenaran styling. Ganti CSS vars di `globals.css` (ungu Material → hitam/putih Ollama), pasang font, bikin primitive (Button pill, Card, Input, Badge). **Semua** halaman ikut otomatis → revamp per-modul jadi tinggal "rakit". Tanpa ini, tiap halaman menambal sendiri = tidak konsisten. |
| **1** | **Login** | Halaman paling kecil & terisolasi (di luar shell dashboard). Tempat aman uji token + primitive baru tanpa risiko ke layout utama. 1 form, 1 CTA. |
| **2** | **Shell Dashboard (`layout.tsx`)** | Sidebar + header + server selector + tombol sync dipakai **semua** halaman dashboard. Harus selaras lebih dulu sebelum isi halaman, supaya modul berikutnya tampil di bingkai yang sudah benar. |
| **3** | **Activity Logs** | Halaman read-only paling sederhana (tabel/daftar + filter). Latihan pola tabel + state loading/empty/error yang dipakai ulang di Servers & AI. |
| **4** | **Servers** | Lebih kompleks: list kartu + status realtime + form CRUD (modal/drawer) + uji koneksi. Pakai ulang pola tabel/kartu dari Logs + form primitive dari Login. Membangun pola **Modal** + **Card-grid** yang dipakai ulang Profiles & Vouchers. |
| **5** | **Profiles** | Grid kartu profil + 2 modal (Buat & Detail/Edit) + force-sync + konfirmasi hapus inline + preset rate-limit. Mewarisi Modal/Card/Form dari Servers → tinggal isi field. |
| **6** | **Vouchers** | Paling padat: summary cards + filter bar + tabel paginasi + bulk-select + 3 modal (generator single/batch, popup proses batch, konfirmasi hapus). Mewarisi Modal + tabel (Logs) + Card (Servers). |
| **7** | **Dashboard** | Paling kompleks visual (monitoring snapshot, kartu resource, traffic, user aktif, auto-refresh 3s). Mewarisi semua komponen (kartu, badge, angka, terminal-mock). |
| **8** | **AI Analis** | Antarmuka prompt + render markdown hasil analisis + riwayat + export PDF. Paling banyak komponen kustom (markdown styling, kode block) → mewarisi seluruh vocabulary. |
| **9** | **QA & Polish** | Responsif, a11y, konsistensi token lintas halaman, regресi fungsi. |

**Prinsip integrasi mulus dengan backend:** revamp dilakukan **per layer tampilan**, data-binding lama (axios + react-query + store) **dipertahankan persis**. Tukar **className/markup**, bukan logika `useEffect`/handler. Tiap halaman: snapshot fungsi → revamp visual → verifikasi fungsi identik.

---

## FASE 0 — Design Token & Komponen Dasar (fondasi) ✅ SELESAI

### 0.1 Font
- [x] Pasang **Nunito** (heading, weight 500/600/700) + **Inter** (body) + **JetBrains Mono** (kode) via `next/font/google` di `app/layout.tsx`.
- [x] Set CSS var: `--font-sans` → Inter, `--font-display` → Nunito, `--font-mono` → JetBrains Mono.
- [x] Terapkan `--font-display` pada `h1–h3` global.

### 0.2 Rombak token warna (`globals.css`)
- [x] Ganti palette Material-3 (ungu `#3525cd`, surface-container) → palette Ollama:
  - `--color-primary: #000000`, `--color-on-primary: #ffffff`
  - `--color-ink: #000000`, `--color-charcoal: #525252`, `--color-body: #737373`, `--color-mute: #a3a3a3`
  - `--color-canvas: #ffffff`, `--color-surface-soft: #fafafa`, `--color-surface-dark: #171717`
  - `--color-hairline: #e5e5e5`, `--color-hairline-strong: #d4d4d4`
- [x] **Map alias lama → token baru** supaya halaman luar-scope (profiles/vouchers) tidak hancur: `surface`→canvas, `on-surface`→ink, `outline-variant`→hairline, `surface-variant`→surface-soft, `primary`→`#000`. (Strategi kompatibilitas, bukan hapus mendadak.)
- [x] Tambah radius token: `--radius-full: 9999px`, `--radius-card: 12px`, `--radius-sm: 6px`.
- [x] Set `body { background: #fff; color: #737373 }` (via `bg-canvas text-body` di `app/layout.tsx`).

### 0.3 Bersihkan dekorasi yang dilarang Ollama
- [x] Hapus/nonaktifkan util `.glass`, `@keyframes gradient`, animasi orb/flow. (Ollama: no gradient, no glass, no drop-shadow.)
- [x] Sisakan animasi halus saja (`fade-in`, `slide-up` pendek) untuk feedback, bukan dekorasi.

### 0.4 Komponen primitif (buat `frontend/src/components/ui/`)
- [x] `Button.tsx` — varian: `primary`/`secondary`/`on-dark`/`ghost`/`danger` + size sm/md + `loading`. Pill `rounded-full`.
- [x] `Card.tsx` — `rounded-[12px] border border-hairline bg-canvas`, **tanpa shadow**. Varian `dark` untuk 1 momen "look here".
- [x] `Input.tsx` + `Label.tsx` (+ `Textarea`, `Select`) — pill `rounded-full h-10`, fokus = border ink + focus-ring biru.
- [x] `Badge.tsx` / `StatusDot.tsx` — dot `rounded-full` netral + label; status ok/warn/danger (dot kecil, no glow).
- [x] `TerminalCard.tsx` — kartu `rounded-lg` + 3 traffic-light dots (12px) + body mono.
- [x] `Skeleton.tsx` (+ `SkeletonCard`) — placeholder loading pulse halus.
- [x] `EmptyState.tsx` — ikon line-art + judul + deskripsi + CTA opsional.
- [x] `PageHeader.tsx` — judul `display-lg` (30px Nunito) + deskripsi + slot aksi. + barrel `index.ts`.

### 0.5 Verifikasi fondasi
- [x] `pnpm dev` → chrome utama netral, tidak ada ungu tersisa.
- [x] `pnpm build` & `tsc` **0 error** (11/11 pages build sukses).

---

## FASE 1 — Login (`app/(auth)/login/page.tsx`) ✅ SELESAI

### Layout & Slicing
- [x] Buang gradient + orb + `glass` + `rounded-3xl` + shadow ungu. Kanvas putih polos, konten center, kolom max-width 400px.
- [x] Header: ikon line-art `Wifi` dalam lingkaran hairline + judul "Masuk" Nunito + subjudul body mute.
- [x] Form pakai `Input` + `Label` primitif (pill). Field email & password.
- [x] Tombol submit = `Button primary` pill hitam full-width, label "Masuk".

### Styling
- [x] Hilangkan semua `bg-primary-container`/`shadow-primary`. Hanya hitam/putih/abu.
- [x] Ikon input dibuat minim (mute) konsisten Ollama.
- [x] **Tambah:** toggle mata password (`Eye`/`EyeOff` line-art, pill, mute→ink, focus-ring).

### State Handling
- [x] **Loading:** tombol disabled + spinner + label "Memproses…" (pertahankan `isLoading`).
- [x] **Error:** banner hairline tipis `text-charcoal` (bukan blok merah). Baca `err.response?.data?.message`.
- [x] **Empty/validasi:** required HTML5 dipertahankan.

### Bug fix (ditemukan saat test)
- [x] **`api-client.ts` interceptor 401**: kecualikan `/auth/login` dari auto-redirect. Sebelumnya 401 login (sandi salah) memicu hard-reload ke /login SEBELUM banner error muncul → gejala "refresh, balik login, tanpa pesan". 401 lain (token expired) tetap redirect.
- [x] Akar tampilan-tak-berubah saat dev: dev server perlu **restart** (font/`@theme` baru tak ter-HMR). Dikonfirmasi: endpoint `POST /api/auth/login` balas 200; CORS `FRONTEND_URL=3100` benar.

### Verifikasi
- [x] Login sukses → redirect `/dashboard` (logika `setSession` tak berubah).
- [x] Login gagal → pesan error backend ("Email atau password salah") tampil tanpa reload.
- [x] Toggle mata password berfungsi.

---

## FASE 2 — Shell Dashboard (`app/(dashboard)/layout.tsx`) ✅ SELESAI

### Sidebar
- [x] Kanvas sidebar putih, border kanan 1px `hairline`.
- [x] Brand: ikon line-art `Wifi` + "WiFi Management" Nunito + sub "Panel Admin".
- [x] Nav item pill: **aktif** = teks ink + `bg-surface-soft`; hover = `surface-soft`. Label di-Indonesia-kan.

### Header
- [x] Tinggi 64px, border bawah hairline, latar putih.
- [x] **Server selector** → pill `surface-soft` + chevron mute. Pertahankan `handleServerChange` + `syncActiveServer`.
- [x] **Status indicator** → `StatusDot` (online=ok / offline=danger / unknown=neutral pulse) dalam pill hairline.
- [x] **Tombol Sinkronisasi global** → pill hitam + `RefreshCw`. Pertahankan `handleGlobalSync` + toast.
- [x] Cluster kanan: nama/email admin, tombol logout ikon mute → hover ink (pill).

### Overlay sync
- [x] Ganti overlay glass+blur+spinner ungu → kartu putih `rounded-[12px]` hairline + spinner ramping hitam + teks. Tanpa backdrop-blur berat.

### State Handling
- [x] **SSR shell** (`!isMounted`) → `bg-canvas`.
- [x] Mobile: header + drawer sidebar pill/hairline. Hamburger mute.

### Verifikasi
- [x] Polling status 30s, sync global, ganti server, logout — logika tak diubah; `tsc` 0 error.

---

## FASE 3 — Activity Logs (`app/(dashboard)/logs/page.tsx`) ✅ SELESAI

### Layout & Slicing
- [x] `PageHeader` "Riwayat Aktivitas" + deskripsi + filter aksi (pill) + tombol "Muat ulang" (secondary).
- [x] Tabel ramping hairline (`Card padded={false}`), thead `surface-soft`, baris dipisah `divide-hairline`, **tanpa shadow/backdrop-blur**.
- [x] Tiap baris: waktu, **badge aksi netral** (`Badge`), deskripsi charcoal, server (`StatusDot` + nama). Sistem = dot neutral.
- [x] Filter aksi → pill `surface-soft`. **Buang** search input non-fungsional (tak ke-bind backend).

### State Handling
- [x] **Loading:** baris spinner "Memuat log…".
- [x] **Error:** banner Card hairline + tombol "Coba lagi" (refetch).
- [x] **Empty:** `EmptyState` "Belum ada aktivitas".
- [x] **Responsif:** label tombol sembunyi di mobile; tabel scroll-x dalam Card.

### Audit & bersih-bersih
- [x] Buang: `rounded-2xl/xl/md` campur, `backdrop-blur`, `bg-primary/10` ungu badge server, `text-primary` ungu, `font-bold`, badge aksi kotak (`rounded`)→pill, glow.

### Verifikasi
- [x] `loadLogs`, paginasi (skip/take), filter aksi, format waktu/tanggal — logika tak diubah; `tsc` 0 error.

---

## FASE 4 — Servers (`app/(dashboard)/servers/page.tsx`) ✅ SELESAI

### Primitif baru (dipakai ulang Fase 5/6)
- [x] **`Modal.tsx`** — overlay `bg-black/40` (tanpa blur berat), kartu putih `rounded-[12px]` hairline, header/footer, tutup via X/overlay/Esc.
- [x] **`Banner.tsx`** — banner inline hairline + `surface-soft` (info/success/error), aksen kecil di ikon.

### Layout & Slicing
- [x] `PageHeader` "Server Router" + tombol "Daftarkan Router" pill hitam.
- [x] Grid kartu hairline: ikon line-art, nama, host:port, `StatusDot`, badge SSL/HTTP. Aktif = border ink + pill "Aktif".
- [x] Form Tambah/Edit → `Modal` + `Input`/`Label` pill + checkbox SSL. Footer pill (Simpan hitam, Batal secondary).
- [x] Detail read-only → tabel `DetailRow` divide-hairline. Uji koneksi → `Banner` hasil.
- [x] Empty: panduan setup (API v6/v7, port 8728/8729) — diperbarui dari REST→binary API.

### State Handling
- [x] **Loading aksi** (uji/simpan/hapus): tombol `loading` + disabled.
- [x] **Error/Success:** `Banner` inline (baca `error.response?.data?.message`).
- [x] **Empty:** `EmptyState` + panduan + CTA.
- [x] **Konfirmasi hapus:** Banner inline pill (bukan `confirm()`).
- [x] **Responsif:** grid 3→2→1.

### Audit & catatan
- [x] Buang: `rounded-2xl/xl`, semua `shadow-*`, `backdrop-blur`, `bg-*-container` ungu, ikon warna+glow, `bg-emerald/amber/error` blok, badge kotak.
- [x] **Bug fix:** `renderFormFields()`/`renderTestResult()` dipanggil sbg FUNGSI (bukan `<Component/>`) → cegah remount input / fokus hilang saat ketik.

### Verifikasi
- [x] CRUD, uji koneksi (custom + existing), hapus — logika & endpoint tak diubah; `tsc` 0 error.

---

## FASE 5 — Profiles (`app/(dashboard)/profiles/page.tsx`) ✅ SELESAI

### Layout & Slicing — daftar
- [x] Header `PageHeader` + tombol "Buat Profil" pill hitam.
- [x] Grid kartu hairline (no shadow): nama, deskripsi, bandwidth up/down (mono), shared, validity, sesi.
- [x] **Badge sinkronisasi** → `Badge` + `StatusDot` (sinkron=ok / gagal=danger), no glow.
- [x] Force-sync → teks "Perbaiki" merah halus di footer kartu (stopPropagation), bukan blok.

### Layout & Slicing — modal Buat & Detail/Edit
- [x] Kedua modal pakai `Modal` primitif (overlay tipis, hairline). Field `Input`/`Label`/`Textarea` pill; input MikroTik mono.
- [x] **Preset rate-limit** → pill; terpilih = ink, lainnya `surface-soft`.
- [x] Detail read-only → tabel `DetailRow` divide-hairline. Status sinkron + Push ke Router.
- [x] Footer: Simpan/Buat hitam, Batal/Tutup secondary, Hapus danger.

### State Handling
- [x] **Loading list:** skeleton kartu.
- [x] **Loading aksi:** tombol `loading` + disabled.
- [x] **Error/Success:** `Banner` inline (baca `error.response?.data?.message`). Success auto-hilang 2.5s.
- [x] **Empty (router belum dipilih):** `EmptyState`.
- [x] **Empty (belum ada profil):** `EmptyState` + CTA "Impor dari Router" (`handleImportFromRouter`) & "Buat Profil".
- [x] **Konfirmasi hapus:** Banner inline pill (`showDeleteConfirm`), bukan `confirm()`.
- [x] **Responsif:** grid 3→2→1.

### Pelajaran diterapkan (dari Fase 4)
- [x] `renderFormFields()` dipanggil sbg FUNGSI (cegah remount input). Tombol Simpan via `onClick` (bukan `form=` cross-DOM).

### Verifikasi
- [x] Buat/Edit/Hapus/force-sync/impor — endpoint & `syncVersion` reload tak diubah; `tsc` 0 error.

---

## FASE 6 — Vouchers (`app/(dashboard)/vouchers/page.tsx`) ✅ SELESAI

> Selesai pakai primitif `Modal`/`Banner`/`Card`/`Select`/`Badge`. Logika (filter/paginasi/bulk-delete/PDF/BullMQ) tak diubah. **Gradient bar popup batch DIBUANG** (ganti spinner hitam ramping). Tombol submit via `onClick` (bukan `form=` cross-DOM). 3 modal: generator (tab single/batch), popup proses batch, konfirmasi hapus. `tsc` 0 error.

---

## ~~FASE 6 — Vouchers~~ (detail asli)

> Halaman terpadat: summary cards + filter bar + tabel paginasi + bulk-select + 3 modal (generator single/batch, popup proses batch, konfirmasi hapus). Hindari ubah logika filter/paginasi/PDF — hanya markup/style.

### Layout & Slicing — daftar
- [ ] Header: judul `display-lg` + tombol "Buat Voucher" pill hitam.
- [ ] **Summary cards** (Total / Unused / Used) → `Card` hairline, angka `display-lg` Nunito + label `caption` mute. Ikon dalam lingkaran `surface-soft` netral (buang `bg-amber/emerald/10` & glow).
- [ ] **Filter bar** → kontainer hairline `rounded-lg`; search + 2 select = pill `surface-soft`. Tombol "Cetak Semua" & "Hapus (n)" pill (hapus pakai pill merah halus). Pertahankan `getPdfFilteredUrl()` apa adanya.
- [ ] **Tabel voucher** → header `surface-soft`, baris dipisah garis hairline, **tanpa** kartu berbayang. Checkbox bulk-select dipertahankan.
- [ ] **Badge status** (Unused/Used/Expired/Revoked) → pill netral + `StatusDot` kecil per status; buang glow `shadow-[0_0_6px]`.
- [ ] **Paginasi** → tombol pill; halaman aktif pill hitam, lainnya secondary. Pertahankan `getPageNumbers()`.
- [ ] Aksi baris (cetak PDF / hapus) → ikon pill secondary; hapus = ikon merah halus.

### Layout & Slicing — modal generator (single & batch)
- [ ] Modal → kanvas putih `rounded-lg` + hairline; overlay tanpa blur berat. **Tabs** Single/Batch → garis bawah ink aktif (bukan `border-primary` ungu).
- [ ] Field + select pakai primitif; input kode/prefix tetap `font-mono`.
- [ ] **Preset jumlah batch** (`10/20/50/100/200`) + **kartu format karakter** → pill/kartu `command-tag`; terpilih = ink, lainnya `surface-soft`. Live-preview kode = chip mono `surface-soft`.

### Layout & Slicing — popup proses batch
- [ ] **Buang gradient bar** (`bg-gradient-to-r … animate-[gradient]`) — dilarang Ollama. Ganti progress = spinner hitam ramping / garis netral.
- [ ] Kartu info batch → hairline `rounded-lg`; status "PROCESSING/QUEUED" pakai `StatusDot` netral. Tombol "Cetak PDF Batch" pill hitam, "Tutup" pill secondary.

### Layout & Slicing — modal konfirmasi hapus
- [ ] Kanvas putih `rounded-lg` + hairline; ikon peringatan line-art. Tombol "Hapus Voucher" pill (boleh aksen merah fungsional minimal), "Batal" pill secondary. Pertahankan `executeDelete` + hint partial-safe.

### State Handling
- [ ] **Loading tabel:** skeleton baris / spinner (pertahankan `isLoading`).
- [ ] **Loading aksi** (generate/hapus/batch): tombol spinner + disabled.
- [ ] **Error/Success:** banner hairline tipis; baca pesan backend apa adanya. Toast (`toast-store`) untuk hasil hapus dipertahankan.
- [ ] **Empty (router belum dipilih / belum ada profil):** `EmptyState` (yang "belum ada profil" + CTA ke `/profiles`).
- [ ] **Empty (tabel tak ada hasil filter):** baris/empty-state "Tidak ada voucher cocok".
- [ ] **Responsif:** summary 3→1; filter bar wrap; tabel scroll-x terkendali di mobile (atau ringkas kolom); modal full-width.

### Verifikasi
- [ ] Generate single/batch (BullMQ), filter, paginasi, bulk-delete, cetak PDF (single/batch/filtered) — semua identik; hanya visual berubah.

---

## FASE 7 — Dashboard (`app/(dashboard)/dashboard/page.tsx`) ✅ SELESAI

### Layout & Slicing
- [x] `PageHeader` "Dasbor · {server}" + status live + auto-refresh + tombol Perbarui.
- [x] **Kartu metrik** (User/Voucher/Uptime/CPU) → `MetricCard` (Card hairline), angka Nunito + label mute + ikon line-art dalam lingkaran hairline (buang `bg-*-container` ungu/oranye + glow).
- [x] **Performa** (CPU/RAM/HDD) → `UsageBar`: bar **hitam (ink)**, no warna semantik/gradient. + Spec badges hairline.
- [x] **User aktif** & **Traffic** → tabel ramping hairline, thead `surface-soft`, `StatusDot`. Format bytes/uptime dipertahankan.
- [x] Konsumsi `GET /monitoring/snapshot/:serverId` existing — tak diubah.

### State Handling
- [x] **Loading awal:** skeleton kartu + blok (surface-soft pulse).
- [x] **Auto-refresh 3 detik** (mentor <5s) → interval + countdown dipertahankan; silent refetch (footer "Memperbarui…").
- [x] **Error:** banner Card hairline + tombol "Coba hubungkan ulang"; data lama tak dihapus mendadak.
- [x] **Tidak ada server:** layout pilih-router (kartu hairline + `StatusDot`).
- [x] **Responsif:** grid metrik 4→2→1; tabel stack.

### Audit & bersih-bersih
- [x] Buang: `rounded-2xl/xl`, semua `shadow-*`, `bg-*-container` (ungu/oranye), badge warna blok, glow `shadow-[0_0_8px]`, `animate-ping/bounce/shake`, `font-extrabold`, `backdrop-blur` thead, progress bar warna.
- [x] Ganti `text-primary` ungu → ink/charcoal. Ekstrak sub-komponen `MetricCard`/`UsageBar`/`SpecBadge`.

### Verifikasi
- [x] Logika fetch/countdown/filter/format tak diubah; `tsc` 0 error. Warning arbitrary-class dibersihkan (`h-100`, `max-w-25/45`).

---

## FASE 8 — AI Analis (`app/(dashboard)/ai/page.tsx` + `ai/[id]/page.tsx`) ✅ SELESAI

> List: panel aksi (model AI Select + tombol Mulai Analisis pill hitam) + riwayat kartu hairline + hapus (modal). Detail: header + aksi (PDF/Salin/Hapus) + kartu markdown prose **netral** (heading Nunito ink, body, code mono surface-soft) + modal hapus. **PDF export (`handleDownloadPdf` + selector `.prose` + html2pdf iframe) TIDAK diubah** — hanya warna PDF header diubah biru→hitam. Buang: shimmer/shine animasi, gradient, `bg-primary/10` ungu, badge provider warna-warni, `shadow-*`, `backdrop-blur` modal, glow. `tsc` 0 error.

---

## ~~FASE 8 — AI Analis~~ (detail asli)

### Layout & Slicing — halaman list (`ai/page.tsx`)
- [ ] `PageHeader` "AI Analis" + deskripsi.
- [ ] **Panel prompt/aksi**: tombol "Analisis Sekarang" pill hitam (+ pilih server bila perlu). Input prompt (bila ada) = `Input`/`textarea` border-hairline `rounded-lg`.
- [ ] **Riwayat Analisis**: daftar kartu `Card` hairline — judul/tanggal `body-strong`, ringkasan mute, aksi **Hapus** (fitur existing) sebagai ikon/pill secondary + konfirmasi.

### Layout & Slicing — halaman detail (`ai/[id]/page.tsx`)
- [ ] Hasil analisis (markdown) → `react-markdown` dengan styling Ollama: heading Nunito, body mute, **code block** pakai `TerminalCard`/mono `surface-soft` `rounded-lg`, list `feature-bullet`. Pertahankan `@tailwindcss/typography` (prose) tapi override warna ke netral.
- [ ] Tombol export PDF (`html2pdf`) tetap; styling tombol → pill secondary. Logika export **tidak diubah**.
- [ ] Temuan/saran bisa dirender sebagai daftar kartu ringkas atau prose — pilih yang konsisten dengan kontrak data existing.

### State Handling
- [ ] **Loading analisis:** spinner + status "Menganalisis konfigurasi…" (proses LLM bisa lama; beri progress teks).
- [ ] **Streaming/lama:** bila non-stream, disable tombol + skeleton hasil.
- [ ] **Error LLM/rate-limit (429):** banner hairline + pesan jelas + retry. Baca pesan backend apa adanya.
- [ ] **Empty riwayat:** `EmptyState` "Belum ada analisis".
- [ ] **Hapus riwayat:** konfirmasi pill (jangan `alert`/`confirm` bawaan) + toast hasil.
- [ ] **Responsif:** detail markdown 1 kolom ~720px reading width; daftar riwayat grid→stack.

### Verifikasi
- [ ] Trigger analisis, render markdown, export PDF, hapus riwayat (+ hapus-semua) — fungsi identik, hanya visual berubah.

---

## FASE 9 — QA, Responsif & Polish ✅ SELESAI

### Responsivitas (breakpoint Ollama)
- [x] Grid responsif tiap halaman (metrik 4→2→1, kartu 3→2→1, summary 3→1).
- [x] Sidebar → drawer hamburger di mobile (layout shell).
- [x] Tabel (logs/voucher/dashboard) overflow-x dalam Card di mobile.
- [x] Label tombol sembunyi di mobile (`hidden sm:inline`) tempat sempit.

### Aksesibilitas & Konsistensi
- [x] Interaktif ≥ 32–40px (pill `h-8`/`h-9`/`h-10`), focus-ring biru `rgba(59,130,246,0.5)` di Input/Button/Select.
- [x] Kontras: ink/charcoal/body di atas putih (AA).
- [x] **Audit token: 0 sisa** `surface-container`/`primary-container`/`outline-variant`/`on-surface-variant`/`tertiary` di 7 modul. 0 `shadow-*`/`gradient`/`.glass`/`#3525cd` (kecuali `animate-ping` ripple kursor LoginDemo — sengaja).
- [x] Konsistensi pill (`rounded-full`) vs card (`rounded-[12px]`).
- [x] `font-display` hanya heading; `font-mono` hanya kode/IP/output.

### Komponen global
- [x] **Toast direvamp**: kartu putih `rounded-[12px]` hairline (buang `surface-container`/`shadow-xl`/`rounded-xl`). Accent fungsional `ok/danger/warn/ink` (buang emerald/amber/primary ungu). Tombol tutup pill.

### Regresi fungsi
- [x] Login → dashboard, JWT interceptor, redirect 401 (+ fix interceptor /auth/login).
- [x] Server selector + sync global + polling 30s.
- [x] Dashboard snapshot 3s, Servers CRUD/uji koneksi, AI trigger/hapus, Logs.
- [x] Profiles buat/edit/hapus/force-sync/impor; Vouchers generate/filter/paginasi/bulk-delete/PDF.
- [x] **`pnpm build` 0 error, 11/11 pages, lint+types lolos.** `tsc --noEmit` 0 error.

### Bug ditemukan & diperbaiki selama revamp
- [x] Interceptor 401 hard-reload sebelum banner login → kecualikan `/auth/login`.
- [x] Format uptime salah ("2 Ja Menit") → regex parser per-unit.
- [x] Duplikasi info dashboard (uptime/versi/CPU) → dihilangkan.
- [x] Button default `type="submit"` → submit liar → default `type="button"`.
- [x] Tombol Simpan `form=` cross-DOM gak jalan → `onClick` langsung.
- [x] Form fields `<Component/>` remount input → dipanggil sbg fungsi.
- [x] **Backend crash** TLS error unhandled → `createApi()` + listener `.on('error')`.
- [x] Scrollbar OS tebal/gelap → scrollbar global tipis netral.

---

## Lampiran — Pemetaan Token Lama → Ollama (acuan cepat)

| Lama (Material-3) | Baru (Ollama) | Catatan |
|-------------------|----------------|---------|
| `bg-surface` / `#fdf7ff` | `bg-canvas` / `#ffffff` | kanvas putih murni |
| `text-primary` ungu `#3525cd` | `text-ink` / `#000000` | hitam, brand tunggal |
| `bg-primary-container` (aktif nav) | `bg-surface-soft` / `#fafafa` | latar item aktif |
| `border-outline-variant` | `border-hairline` / `#e5e5e5` | garis 1px |
| `bg-surface-variant` (input) | `bg-surface-soft` pill | input/selector |
| `rounded-xl` / `rounded-3xl` tombol | `rounded-full` | semua interaktif = pill |
| `.glass` + gradient + orb | **dihapus** | dilarang Ollama |
| `shadow-primary` / `shadow-2xl` | **dihapus** | depth = hairline / dark surface |
| heading `font-bold` Inter | Nunito 500–600 | display face |

> **Aturan emas:** sebelum tambah token/warna baru, tanya — bisakah dipakai vocabulary yang ada (pill + flat-card + terminal-mock)? Restraint **adalah** desainnya.
