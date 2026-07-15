# Dokumentasi — P5 Web Management WiFi untuk FnB

Peta seluruh folder `doc/`. Fokus utama repositori ini adalah **backend** (NestJS API).
Base URL backend: `http://localhost:4000/api` · Swagger: `/api/docs`.

## Backend (mulai dari sini)

| Dokumen | Isi |
|---------|-----|
| [`BACKEND.md`](./BACKEND.md) | **Acuan dasar backend** — tech stack, struktur modul, katalog endpoint, MikroTik, skema DB, keamanan, command. Pusat navigasi. |
| [`todo_backendp.md`](./todo_backendp.md) | Roadmap & status pengerjaan backend (RBAC, AI chat, billing/Duitku, dokumentasi). |

## `api/` — Kontrak endpoint per-fitur
Indeks lengkap + tabel doc/hasil-uji: [`api/README.md`](./api/README.md). Berisi kontrak RBAC/Auth,
Billing/Duitku, AI Chat, dan Integrasi POS (masing-masing dengan file `*-test-results.md`).

## `spec/` — Dokumen rekayasa formal
[`spec/README.md`](./spec/README.md) — PRD, SRS, SDD, ARSITEKTUR. Disusun dari kode aktual;
sumber kebenaran untuk desain & arsitektur mendalam.

## `frontend/` — Dokumentasi sisi frontend
Arsitektur admin panel ([`frontend/FRONTEND.md`](./frontend/FRONTEND.md)), design system
([`frontend/DESIGN-ollama.md`](./frontend/DESIGN-ollama.md)), rencana revamp UI, dan memo tindak lanjut
audit. Di luar fokus backend, dikelompokkan agar rapi.

## `archive/` — Historis / usang
Dokumen yang sudah digantikan atau tidak lagi mencerminkan kondisi kode. Lihat
[`archive/README.md`](./archive/README.md) untuk alasan pengarsipan tiap file. **Jangan** dijadikan acuan.
