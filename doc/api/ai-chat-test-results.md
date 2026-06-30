# Hasil Uji Endpoint AI Chat Widget (Pilar B)

**Tanggal uji:** 2026-06-29
**Lingkungan:** lokal — backend `http://localhost:4000/api` (prod build), PostgreSQL 18 (Docker :5433), Redis (:6379).
**Kredensial LLM:** `.env` repo **kosong** (GEMINI/OPENROUTER/OPENAI/ANTHROPIC) — sesuai kondisi repo.
Tanpa key, panggilan LLM mengembalikan **400** ("belum dikonfigurasi"); seluruh guard/scoping/kepemilikan
sesi tetap diuji penuh. (Jawaban AI live diverifikasi terpisah setelah user mengisi key.)
**Metode:** black-box `Invoke-WebRequest` (status + body) + verifikasi state DB (Prisma) untuk efek samping.

## Ringkasan

| | |
|---|---|
| Total skenario | **24** |
| ✅ Lulus | **24** |
| ❌ Gagal | **0** |

Mencakup: autentikasi (401), validasi DTO (400), scoping `serverId` lintas-tenant (403/404),
panggilan LLM tercapai untuk semua role (400 tanpa key), kepemilikan sesi (404), efek samping
transaksional (gagal LLM → tak ada data tersimpan), dan hapus sesi oleh pemilik.

---

## A. Autentikasi — tanpa token → 401

| Skenario | Harapan | Aktual | Status |
|---|:-:|:-:|:-:|
| `POST /ai/chat` tanpa token | 401 | 401 | ✅ |
| `GET /ai/chat/sessions` tanpa token | 401 | 401 | ✅ |
| `GET /ai/chat/sessions/:id` tanpa token | 401 | 401 | ✅ |
| `DELETE /ai/chat/sessions/:id` tanpa token | 401 | 401 | ✅ |

---

## B. Validasi DTO — `POST /ai/chat` → 400

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| `question` kosong (`""`) | OWNER | 400 | 400 | ✅ |
| `question` tidak dikirim | OWNER | 400 | 400 | ✅ |
| `question` > 2000 karakter | OWNER | 400 | 400 | ✅ |

Body 400 validasi: `{"message":["Pertanyaan wajib diisi"],"error":"Bad Request","statusCode":400}`

---

## C. Scoping `serverId` (lintas-tenant)

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| `serverId` tidak ada di DB | OWNER | 404 | 404 | ✅ |
| `serverId` = router milik **Owner lain** | OWNER | 403 | 403 | ✅ |

Body 404: `{"message":"Router dengan ID nonexistent-id-xyz tidak ditemukan","error":"Not Found","statusCode":404}`
Body 403: `{"message":"Anda tidak punya akses ke resource ini","error":"Forbidden","statusCode":403}`

---

## D. Panggilan LLM tercapai (key kosong → 400)

Membuktikan request lolos guard + scoping + pembangunan konteks, lalu berhenti di panggilan LLM.

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| chat tanpa `serverId` | OWNER | 400 | 400 | ✅ |
| chat tanpa `serverId` | TEKNISI | 400 | 400 | ✅ |
| chat tanpa `serverId` | SUPER_ADMIN | 400 | 400 | ✅ |
| chat + `serverId` **milik sendiri** (lolos scope) | OWNER | 400 | 400 | ✅ |
| chat + `serverId` router Owner-nya (lolos scope) | TEKNISI | 400 | 400 | ✅ |

Body 400 LLM: `{"message":"Gagal memanggil AI: API Key untuk Google Gemini belum dikonfigurasi di server (.env).","error":"Bad Request","statusCode":400}`

> Catatan: `serverId` valid menunjuk router dengan host tak terjangkau → tarik konfig live gagal namun
> **ditangani `try/catch`** (tidak menggagalkan request); request tetap maju ke panggilan LLM. Ini
> sekaligus memverifikasi ketahanan `buildChatContext` saat router offline.

---

## E. Kepemilikan Sesi

Disiapkan 1 sesi milik **OWNER** (2 pesan) langsung di DB.

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| `GET /ai/chat/sessions` (belum punya sesi) | TEKNISI | 200 `[]` | 200 | ✅ |
| `GET` sesi milik OWNER | TEKNISI | 404 | 404 | ✅ |
| `DELETE` sesi milik OWNER | TEKNISI | 404 | 404 | ✅ |
| `GET` sesi milik OWNER | OWNER | 200 | 200 | ✅ |
| `GET` sesi tidak ada | OWNER | 404 | 404 | ✅ |
| `GET /ai/chat/sessions` | OWNER | 200 | 200 | ✅ |

Body 404 sesi: `{"message":"Sesi chat tidak ditemukan","error":"Not Found","statusCode":404}`

---

## F. Efek Samping — gagal LLM tidak menyimpan data

Setelah 5 percobaan chat (semua gagal di LLM karena key kosong), state DB diperiksa via Prisma.

| Skenario | Harapan | Aktual | Status |
|---|:-:|:-:|:-:|
| Jumlah sesi tetap = 1 (hanya sesi siapan) | 1 | 1 | ✅ |
| Jumlah pesan tetap = 2 (hanya pesan siapan) | 2 | 2 | ✅ |

> Membuktikan penyimpanan dilakukan **transaksional setelah** LLM sukses — chat gagal tak meninggalkan sampah.

---

## G. Hapus Sesi oleh Pemilik

| Skenario | Aktor | Harapan | Aktual | Status |
|---|---|:-:|:-:|:-:|
| `DELETE` sesi milik OWNER | OWNER | 200 | 200 | ✅ |
| `GET` sesi yang sama setelah dihapus | OWNER | 404 | 404 | ✅ |

Body 200 hapus: `{"success":true,"message":"Sesi chat dihapus"}`

---

## Catatan Metodologi

- `POST /auth/login` dibatasi 5/menit/IP → suite memakai 3 login (owner/teknisi/super); throttle in-memory
  di-reset dengan restart server sebelum run.
- Jalur **jawaban LLM sukses (201)** tidak di-assert di suite ini (butuh API key provider + jaringan);
  hanya guard/scoping/validasi/kepemilikan + bahwa request mencapai lapisan LLM. Lihat `doc/api/ai-chat.md`
  untuk contoh respons sukses.
- Data uji (2 router, 1 OWNER kedua, 1 sesi + 2 pesan) dibuat saat tes lalu **dibersihkan**; DB kembali ke
  kondisi seed (1 SUPER_ADMIN / 1 OWNER / 1 TEKNISI, 0 router, 0 sesi, 0 pesan, 2 paket).
- Skrip uji & helper berada di luar repo (scratchpad); hasil ini dari run terakhir: **24/24 lulus**.
