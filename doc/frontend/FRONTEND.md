# FRONTEND.md — Arsitektur Frontend (Admin Panel)

**Proyek:** Web Management WiFi untuk FnB (P5)
**Status dokumen:** mencerminkan kondisi kode hasil audit (in-progress).

---

## 1. Tech Stack (Realita Kode)

| Komponen | Teknologi |
|----------|-----------|
| Framework | Next.js 15 (App Router) + React 19 |
| Styling | **Tailwind CSS v4** + `@tailwindcss/typography` + token Material Design 3 custom |
| Komponen UI | **lucide-react** (ikon) + komponen **custom** (modal/card/input dibuat manual) |
| State global | **Zustand** (auth, server aktif, toast) — persist ke localStorage |
| HTTP | **axios** (`apiClient`) dengan interceptor JWT + redirect 401 |
| Markdown | `react-markdown` (render laporan AI) |
| PDF browser | `html2pdf.js` (export laporan AI) |
| Theme | `next-themes` (dark mode default) |
| Package manager | npm (dev di port **3100**) |

> ⚠️ **Catatan akurasi:** Brief menyebut **shadcn/ui** — pada kode **TIDAK dipakai** (tak ada
> folder `ui/`, tak ada registry shadcn). UI dibangun langsung dengan Tailwind + lucide + custom.
> **React Query** dan **react-hook-form + zod** **terpasang** di `package.json` tetapi **belum
> dipakai** di halaman (fetching & form masih manual `useState`) → peluang optimasi.

---

## 2. Struktur Routing

`frontend/src/app/`:

```
(auth)/
  login/page.tsx          — Login admin (email + password)
(dashboard)/
  layout.tsx              — Shell: sidebar nav + server selector + overlay sinkronisasi
  dashboard/page.tsx      — Monitoring live (user aktif, traffic, resource, auto-refresh)
  servers/page.tsx        — CRUD server MikroTik (modal add/edit/delete, test koneksi)
  profiles/page.tsx       — CRUD hotspot profile + sync dari router
  vouchers/page.tsx       — Generator voucher (single/batch) + tabel + bulk delete + PDF
  ai/page.tsx             — Daftar & riwayat analisis AI (pilih provider)
  ai/[id]/page.tsx        — Detail laporan AI (render markdown, copy, export PDF)
  logs/page.tsx           — Activity log (paginated + filter)
layout.tsx                — Root layout (font, providers, metadata)
page.tsx                  — Redirect ke login/dashboard
```

> Tidak ada halaman `/pos` (modul POS belum dibangun). Nav sidebar pun tanpa item POS.

---

## 3. Navigasi Sidebar (`(dashboard)/layout.tsx`)

6 item:

| Nama | Href | Ikon |
|------|------|------|
| Dashboard | `/dashboard` | LayoutDashboard |
| Servers | `/servers` | Server |
| Profiles | `/profiles` | Users |
| Vouchers | `/vouchers` | Ticket |
| AI Analysis | `/ai` | BrainCircuit |
| Activity Logs | `/logs` | History |

Header memuat **server selector** (dropdown server aktif + indikator status ONLINE/OFFLINE),
profil admin, tombol logout. Overlay glassmorphism saat sinkronisasi router.

---

## 4. State Management (Zustand)

| Store | File | Isi |
|-------|------|-----|
| Auth | `store/auth-store.ts` | `token`, `admin`, `isAuthenticated`; persist `wifi_token`/`wifi_admin` |
| Server | `store/server-store.ts` | `servers[]`, `activeServerId`, `isSyncing`, `syncError`; aksi `fetchServers`, `setActiveServerId`, `syncActiveServer`, `checkActiveServerStatus` |
| Toast | `store/toast-store.ts` | antrean toast (`success`/`error`/`warning`/`info`), auto-dismiss |

---

## 5. Data Fetching & API Client

`lib/api-client.ts`:
- `baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api'` (env-based).
- Interceptor request → sisip `Authorization: Bearer <token>`.
- Interceptor response → `401` → clear session + redirect `/login`.

Semua halaman fetch manual via `apiClient` + `useState`/`useEffect` (belum pakai React Query).
URL PDF voucher juga dibangun dari `NEXT_PUBLIC_API_URL` (dibuka langsung di browser).

---

## 6. Komponen & UI

`components/`:
- `Toast.tsx` — container notifikasi (stack kanan-atas, ikon + accent per tipe, animasi masuk/keluar).
- `providers.tsx` — `QueryClientProvider` (staleTime 60s) + `ThemeProvider` (next-themes).

Styling: `globals.css` mendefinisikan token MD3 (primary, surface, error, dst) + keyframes
(`fade-in`, `slide-up`, `slide-in-right`). Efek glassmorphism via `.glass`.

---

## 7. Halaman & Status (Hasil Audit)

| Halaman | Status | Fitur utama |
|---------|--------|-------------|
| `/login` | ✅ Lengkap | Validasi form, simpan token |
| `/dashboard` | ✅ Lengkap | User aktif, traffic, resource; auto-refresh 3/10/30/60 dtk; search; hydration-safe |
| `/servers` | ✅ Lengkap | CRUD, test koneksi (latency), SSL toggle, panduan setup |
| `/profiles` | ✅ Lengkap | CRUD, sync dari router, preset rate-limit, tombol perbaiki desync |
| `/vouchers` | ✅ Lengkap | Generate single/batch, bulk delete (partial-safe + toast), PDF, pagination, filter |
| `/ai` | ✅ Lengkap | Pilih provider LLM, riwayat analisis |
| `/ai/[id]` | ✅ Lengkap | Render markdown, copy, export PDF (html2pdf, workaround Tailwind v4 oklab) |
| `/logs` | ✅ Lengkap | Tabel paginated, filter action + server |

---

## 8. Catatan / Peluang Optimasi

- **React Query belum dipakai** — migrasi fetch manual ke `useQuery`/`useMutation` (cache, dedup, invalidasi saat mutasi).
- **react-hook-form + zod belum dipakai** — form masih `useState`; bisa dipakai untuk validasi konsisten, atau hapus deps mati.
- **JWT di localStorage** — rawan XSS; pertimbangkan httpOnly cookie.
- **Komponen besar** (`vouchers`, `servers`, `dashboard` ~1000+ baris) — bisa dipecah jadi komponen anak + hook.
- **Belum ada `error.tsx`** per route group.

## 9. Command
```bash
cd frontend
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL=http://localhost:4100/api
npm run dev                         # → http://localhost:3100
```
