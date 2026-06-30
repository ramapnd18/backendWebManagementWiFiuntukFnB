# API — AI Chat Widget (Kontekstual, Multi-turn)

**Modul:** `ai` (`AiService` + `AiController`).
**Status:** ✅ Implementasi selesai & terverifikasi runtime (2026-06-29).
**Base URL:** `http://localhost:4000/api`
**Hasil uji menyeluruh:** lihat [`doc/api/ai-chat-test-results.md`](./ai-chat-test-results.md) — **24/24 skenario lulus** (2026-06-29).

Widget chat AI mengambang (floating) untuk bertanya tentang kondisi jaringan. Backend **menyuntik
konteks jaringan milik user** (daftar router + status, aktivitas terbaru, laporan AI terakhir, dan —
bila `serverId` diisi — konfigurasi live router) ke dalam prompt **sebelum** memanggil LLM. Percakapan
bersifat **multi-turn**: riwayat disimpan per sesi dan diikutkan pada panggilan berikutnya.

---

## Konsep

- **AiChatSession** — 1 percakapan milik 1 user (`userId`). Opsional terikat ke `serverId`. `title`
  diambil dari 60 karakter pertama pertanyaan pertama.
- **AiChatMessage** — pesan dalam sesi, `role` = `USER` | `ASSISTANT`, urut `createdAt`.
- **Konteks ter-scope** (anti bocor antar-tenant) — dibangun di `buildChatContext()`:
  - Daftar router (maks 20) + status & cek terakhir, **hanya milik user** (`serverScopeWhere`).
  - 15 `ActivityLog` terbaru (ter-scope).
  - 1 `AiReport` terakhir (`resultMd` dipotong 2000 char).
  - Bila `serverId` diisi: **konfigurasi live** via `MikrotikService.getFullConfig()` (dipotong 4000 char).
    Gagal tarik konfig **tidak menggagalkan** chat — ditangani `try/catch`, ditandai di konteks.
- **Multi-turn** — kirim `sessionId` untuk melanjutkan; kosong → sesi baru dibuat **setelah** LLM sukses.
- **Atomik** — bila panggilan LLM gagal, **tidak ada** sesi/pesan yang tersimpan (disimpan dalam `$transaction`).
- **Provider LLM** — `LLM_PROVIDER` (default `gemini`); dukung `gemini` / `openrouter` / `openai` / `anthropic`.

---

## Matriks Akses

Semua endpoint butuh JWT. Chat boleh **semua role** (termasuk OWNER read-only); konteks & sesi selalu
ter-scope ke data milik user yang login.

| Endpoint | SUPER_ADMIN | OWNER | TEKNISI |
|----------|:-:|:-:|:-:|
| `POST /ai/chat` | ✅ | ✅ | ✅ |
| `GET /ai/chat/sessions` | ✅ | ✅ | ✅ |
| `GET /ai/chat/sessions/:id` | ✅ | ✅ | ✅ |
| `DELETE /ai/chat/sessions/:id` | ✅ | ✅ | ✅ |

> Scoping data: SUPER_ADMIN melihat semua router/log; OWNER & TEKNISI hanya milik Owner-nya. Sesi chat
> selalu milik pribadi (`userId`) — user lain tak bisa membaca/menghapus sesi orang lain (→ 404).
> Rate limit `POST /ai/chat`: **20 permintaan / menit / IP** (`@Throttle`).

---

## Endpoint

### 1. Kirim pertanyaan — `POST /api/ai/chat`

Butuh JWT (semua role). Menyuntik konteks jaringan user → memanggil LLM → menyimpan riwayat.

**Request Payload**
```json
{
  "question": "Bagaimana kondisi jaringan saya?",
  "serverId": "cmqx...",   // opsional — fokus konteks + tarik konfig live router ini
  "sessionId": "cmqy..."   // opsional — lanjutkan percakapan; kosong = sesi baru
}
```
Validasi: `question` wajib (1–2000 karakter). `serverId`/`sessionId` opsional (string).

**Response 201 (Success)**
```json
{
  "sessionId": "cmqz...",
  "answer": "Berdasarkan konteks, Anda punya 1 router (CHAT-TEST-RTR) berstatus ONLINE ...",
  "serverId": null
}
```
> Jawaban LLM live memerlukan API key provider terisi di `.env`. Tanpa key → **400** (lihat di bawah).

**Response 400 (Error — validasi)**
```json
{ "statusCode": 400, "message": ["Pertanyaan wajib diisi"], "error": "Bad Request" }
```

**Response 400 (Error — LLM gagal / belum dikonfigurasi)**
```json
{ "statusCode": 400, "message": "Gagal memanggil AI: API Key untuk Google Gemini belum dikonfigurasi di server (.env).", "error": "Bad Request" }
```

**Response 403 (Error — router milik Owner lain)**
```json
{ "statusCode": 403, "message": "Anda tidak punya akses ke resource ini", "error": "Forbidden" }
```

**Response 404 (Error — router tidak ada)**
```json
{ "statusCode": 404, "message": "Router dengan ID nonexistent-id-xyz tidak ditemukan", "error": "Not Found" }
```

**Response 404 (Error — sesi tidak ada / bukan milik user)**
```json
{ "statusCode": 404, "message": "Sesi chat tidak ditemukan", "error": "Not Found" }
```

---

### 2. Daftar sesi chat — `GET /api/ai/chat/sessions`

Butuh JWT. Mengembalikan sesi milik user (terbaru dulu) + jumlah pesan.

**Response 200 (Success)**
```json
[
  {
    "id": "cmqz...",
    "title": "Bagaimana kondisi jaringan saya?",
    "serverId": null,
    "createdAt": "2026-06-29T12:00:00.000Z",
    "updatedAt": "2026-06-29T12:05:00.000Z",
    "_count": { "messages": 4 }
  }
]
```
> User tanpa sesi → `[]`.

---

### 3. Detail sesi + riwayat — `GET /api/ai/chat/sessions/:id`

Butuh JWT. Hanya pemilik sesi.

**Response 200 (Success)**
```json
{
  "id": "cmqz...",
  "userId": "cmqw...",
  "serverId": null,
  "title": "Bagaimana kondisi jaringan saya?",
  "createdAt": "2026-06-29T12:00:00.000Z",
  "updatedAt": "2026-06-29T12:05:00.000Z",
  "messages": [
    { "id": "m1", "role": "USER", "content": "Bagaimana kondisi jaringan saya?", "createdAt": "..." },
    { "id": "m2", "role": "ASSISTANT", "content": "Berdasarkan konteks ...", "createdAt": "..." }
  ]
}
```

**Response 404 (Error — tidak ada / bukan milik user)**
```json
{ "statusCode": 404, "message": "Sesi chat tidak ditemukan", "error": "Not Found" }
```

---

### 4. Hapus sesi chat — `DELETE /api/ai/chat/sessions/:id`

Butuh JWT. Hanya pemilik sesi. Menghapus sesi + seluruh pesannya (cascade).

**Response 200 (Success)**
```json
{ "success": true, "message": "Sesi chat dihapus" }
```

**Response 404 (Error — tidak ada / bukan milik user)**
```json
{ "statusCode": 404, "message": "Sesi chat tidak ditemukan", "error": "Not Found" }
```

---

## Skema Data

```prisma
model AiChatSession {
  id        String   @id @default(cuid())
  userId    String   // pemilik percakapan
  serverId  String?  // konteks router (opsional)
  title     String?  // dari pertanyaan pertama
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  AiChatMessage[]
  // server onDelete: SetNull, user onDelete: Cascade
}

model AiChatMessage {
  id        String   @id @default(cuid())
  sessionId String   // onDelete: Cascade
  role      ChatRole // USER | ASSISTANT
  content   String
  createdAt DateTime @default(now())
}
```
Migrasi: `20260629132520_ai_chat_sessions`.

---

## Environment (`.env`)

```
LLM_PROVIDER=gemini          # gemini | openrouter | openai | anthropic
GEMINI_API_KEY=              # diisi user
OPENROUTER_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```
> Tanpa API key provider terpilih, `POST /ai/chat` mengembalikan **400** dengan pesan "belum dikonfigurasi".
> Seluruh guard/scoping/kepemilikan sesi **tetap dapat diuji** tanpa key (lihat hasil uji).

---

## Catatan Verifikasi (2026-06-29)

Terbukti runtime (build prod, 24/24): auth 401 (4 endpoint tanpa token) → validasi 400 (question kosong /
hilang / >2000) → scoping serverId (404 tidak ada, 403 router Owner lain) → LLM tercapai untuk ketiga role
& serverId milik sendiri (400 karena key kosong) → kepemilikan sesi (TEKNISI baca/hapus sesi OWNER → 404;
OWNER baca sesi sendiri → 200) → **LLM gagal tidak menyimpan sesi/pesan** (jumlah tetap) → DELETE oleh
pemilik 200 lalu GET 404. `npm run build` 0 error.
