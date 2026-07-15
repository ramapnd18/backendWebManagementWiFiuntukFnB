# Arsip Dokumentasi

Berkas di folder ini **sudah digantikan** atau **tidak lagi mencerminkan kondisi kode**.
Disimpan untuk jejak historis — **jangan dijadikan acuan**. Gunakan penggantinya di bawah.

| Berkas | Alasan diarsipkan | Pengganti |
|--------|-------------------|-----------|
| `POS_INTEGRATION.md` | Spec as-built POS; kontrak endpoint dilebur & disegarkan (port `:4000`, `serverId` opsional) | [`../api/pos.md`](../api/pos.md) + [`../spec/SDD.md`](../spec/SDD.md) |
| `endpointpos.md` | Versi eksternal doc POS; kontennya ikut dilebur ke kontrak API POS | [`../api/pos.md`](../api/pos.md) |
| `TODOLIST.md` | Roadmap 40 hari yang **kontradiktif** dengan realita (mis. menyatakan "POS belum mulai" padahal sudah selesai) | [`../todo_backendp.md`](../todo_backendp.md) + [`../spec/PRD.md`](../spec/PRD.md) |
| `CATATAN_BACKEND.md` | Memo audit frontend→backend (temuan B1–B10), sifatnya point-in-time & mayoritas sudah beres | [`../todo_backendp.md`](../todo_backendp.md) |
| `spec.zip` | Arsip zip redundan dengan `doc/spec/*.md` (di-.gitignore) | [`../spec/`](../spec/) |

> Catatan: `spec.zip` mungkin tidak lagi ada di disk (untracked/gitignored) — isinya identik dengan folder `doc/spec/`.
