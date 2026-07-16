# API — AI Analysis & Laporan

**Modul:** `ai` (`AiService` + `AiController`).
**Status:** ✅ terverifikasi runtime 2026-07-16.
**Base URL:** `http://localhost:4000/api`

Endpoint AI **analisis & laporan**: menarik konfigurasi live router MikroTik → mengirim ke LLM →
menyimpan hasil sebagai `AiReport` (Markdown) untuk dilihat/dihapus kembali. Fitur teknis, jadi
**hanya TEKNISI & SUPER_ADMIN** — Owner ditolak (403).

> Endpoint **AI Chat** (widget kontekstual multi-turn) berada di controller yang sama tetapi
> didokumentasikan terpisah di [`doc/api/ai-chat.md`](./ai-chat.md). Lihat ringkasannya di bawah.

---

## Konsep

- **AiReport** — hasil satu analisis: `provider`, `configJson` (snapshot konfig router saat analisis),
  `resultMd` (temuan + saran dalam Markdown), `status` (`COMPLETED`), terikat ke `serverId`.
- **Alur analisis** (`analyzeServer`): muat router (scoping kepemilikan) → tarik konfig via
  `MikrotikService.getFullConfig()` → rakit prompt persona "Network Engineer & MikroTik Expert" →
  panggil provider LLM → simpan `AiReport` → catat `ActivityLog` (`AI_ANALYSIS_COMPLETED`).
- **Provider LLM** — dipilih per-request via body `{ provider? }`. Bila kosong → default `gemini`.
  Dukung `gemini` / `openrouter` / `openai` / `anthropic`. API key masing-masing dari `.env`.
- **Scoping** (`common/scope.util.ts`) — laporan ter-scope ke router milik user: SUPER_ADMIN semua;
  OWNER/TEKNISI hanya router milik Owner-nya (`serverScopeWhere` + `assertOwnerAccess`).
- **Throttle** — `POST /ai/servers/:id/analyze` dibatasi **10 permintaan / jam / IP** (panggilan LLM mahal).

---

## Matriks Akses

Semua endpoint butuh JWT. Analisis & laporan = fitur teknis (`@Roles('TEKNISI','SUPER_ADMIN')`).

| Endpoint | SUPER_ADMIN | OWNER | TEKNISI |
|----------|:-:|:-:|:-:|
| `POST /ai/servers/:id/analyze` | ✅ | ❌ 403 | ✅ |
| `GET /ai/reports` | ✅ (semua) | ❌ 403 | ✅ (milik Owner) |
| `GET /ai/reports/:id` | ✅ | ❌ 403 | ✅ |
| `DELETE /ai/reports` | ✅ | ❌ 403 | ✅ |
| `DELETE /ai/reports/:id` | ✅ | ❌ 403 | ✅ |
| `POST /ai/chat`, `GET/DELETE /ai/chat/sessions*` | ✅ | ✅ | ✅ |

> Data laporan selalu ter-scope: OWNER/TEKNISI hanya laporan dari router milik Owner. Mengakses laporan
> router Owner lain → **403**. Endpoint **chat** (baris terakhir) boleh semua role — lihat `ai-chat.md`.

---

## Endpoint

### 1. Jalankan analisis — `POST /api/ai/servers/:id/analyze`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Throttle **10/jam/IP**. Menarik konfigurasi live router `:id`,
mengirim ke LLM, dan menyimpan hasilnya sebagai `AiReport`.

**Path param:** `id` — ID server MikroTik.

**Request Payload** (opsional):
```json
{ "provider": "gemini" }   // opsional — gemini | openrouter | openai | anthropic; kosong = default (gemini)
```
> Body **boleh dikosongkan sama sekali**. Bila body/`provider` tidak dikirim, service jatuh ke provider
> default (`gemini`).

**Response 201 (Success)**
```json
{
  "id": "cmr...",
  "serverId": "cmqx...",
  "provider": "gemini",
  "configJson": "{ \"resources\": { ... \"version\": \"7.19.3 (stable)\" }, ... }",
  "resultMd": "# Ringkasan Kondisi Server\n...temuan & saran (Markdown)...",
  "status": "COMPLETED",
  "createdAt": "2026-07-16T..."
}
```

**Response 400 (Error — gagal tarik konfig router)**
```json
{ "statusCode": 400, "message": "Gagal menarik konfigurasi dari router: <detail>", "error": "Bad Request" }
```

**Response 400 (Error — LLM gagal / provider belum dikonfigurasi)**
```json
{ "statusCode": 400, "message": "Gagal memanggil LLM provider (gemini): API Key untuk Google Gemini belum dikonfigurasi di server (.env).", "error": "Bad Request" }
```

**Response 403 (Error — router milik Owner lain / role OWNER)**
```json
{ "statusCode": 403, "message": "Anda tidak punya akses ke resource ini", "error": "Forbidden" }
```

**Response 404 (Error — router tidak ada)**
```json
{ "statusCode": 404, "message": "Router dengan ID <id> tidak ditemukan", "error": "Not Found" }
```

> **Catatan perbaikan (2026-07-16):** endpoint ini sebelumnya mengembalikan **500**
> (`Cannot read properties of undefined (reading 'provider')`) bila dipanggil **tanpa body**.
> Sudah diperbaiki — body & `provider` dijadikan **opsional**, dengan fallback ke provider default (env/gemini).

---

### 2. Daftar laporan — `GET /api/ai/reports`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Laporan ter-scope, terbaru dulu, menyertakan info server.

**Response 200 (Success)**
```json
[
  {
    "id": "cmr...",
    "serverId": "cmqx...",
    "provider": "gemini",
    "configJson": "{ ... }",
    "resultMd": "# Ringkasan Kondisi Server\n...",
    "status": "COMPLETED",
    "createdAt": "2026-07-16T...",
    "server": { "name": "CHR-Lab", "host": "192.168.56.101" }
  }
]
```
> Tanpa laporan → `[]`.

---

### 3. Detail laporan — `GET /api/ai/reports/:id`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Hanya laporan dari router milik Owner user.

**Response 200 (Success)** — objek `AiReport` + `server: { name, host, ownerId }`.

**Response 403 (Error — router milik Owner lain)**
```json
{ "statusCode": 403, "message": "Anda tidak punya akses ke resource ini", "error": "Forbidden" }
```

**Response 404 (Error — tidak ada)**
```json
{ "statusCode": 404, "message": "Laporan dengan ID <id> tidak ditemukan", "error": "Not Found" }
```

---

### 4. Hapus semua laporan — `DELETE /api/ai/reports`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Menghapus **seluruh** laporan yang ter-scope ke router milik user
(clear riwayat). Mencatat `ActivityLog` (`AI_ANALYSIS_DELETED`).

**Response 200 (Success)**
```json
{ "success": true, "deletedCount": 3, "message": "3 laporan berhasil dihapus" }
```

---

### 5. Hapus satu laporan — `DELETE /api/ai/reports/:id`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Hanya laporan dari router milik Owner user.
Mencatat `ActivityLog` (`AI_ANALYSIS_DELETED`).

**Response 200 (Success)**
```json
{ "success": true, "message": "Laporan berhasil dihapus" }
```

**Response 403 / 404** — sama seperti detail laporan (router Owner lain → 403; tidak ada → 404).

---

## Endpoint Chat (ringkas — lihat `ai-chat.md`)

Berada di controller yang sama tetapi untuk widget chat kontekstual multi-turn (boleh **semua role**,
konteks ter-scope). Detail kontrak, payload, dan hasil uji ada di [`doc/api/ai-chat.md`](./ai-chat.md).

| Endpoint | Ringkas |
|----------|---------|
| `POST /ai/chat` | Tanya AI kontekstual (inject log/konfig router user); throttle 20/menit/IP |
| `GET /ai/chat/sessions` | Daftar sesi chat milik user |
| `GET /ai/chat/sessions/:id` | Detail sesi + riwayat pesan |
| `DELETE /ai/chat/sessions/:id` | Hapus sesi chat |

---

## Environment (`.env`)

```
LLM_PROVIDER=gemini          # default provider bila request tidak menyebut provider
GEMINI_API_KEY=              # diisi user
OPENROUTER_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```
> Tanpa API key provider terpilih, `POST /ai/servers/:id/analyze` mengembalikan **400** "belum dikonfigurasi".
> Guard/scoping tetap dapat diuji tanpa key.

---

## Hasil Uji Runtime (2026-07-16)

Router uji: MikroTik CHR 7.19.3 (`192.168.56.101:8728`, ONLINE). Server `CHR-Lab` (milik owner).
`[NNN]` = HTTP code aktual.

| Skenario | Hasil |
|----------|-------|
| `POST /ai/servers/:id/analyze` teknisi (tanpa body) | **201** `{id, serverId, provider:"gemini", configJson:"{resources...version 7.19.3}", resultMd, status:"COMPLETED"}` |
| ↳ regresi sebelum fix (tanpa body) | **500** `Cannot read properties of undefined (reading 'provider')` — **sudah diperbaiki** (body & provider opsional, fallback default env) |
| `GET /ai/reports` teknisi | **200** `[]` |
| `GET /ai/reports` owner | **403** (Owner tak boleh analisis/laporan) |
| `POST /ai/chat` owner | **201** `{sessionId, answer:"Status router Anda (CHR-Lab ...) ONLINE ...", serverId, provider}` (lihat `ai-chat.md`) |
| `POST /ai/chat` question kosong | **400** |
| `GET /ai/chat/sessions` owner | **200** |
