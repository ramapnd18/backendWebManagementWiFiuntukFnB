# Panduan Uji Coba Mandiri — Integrasi POS

Panduan lengkap menguji endpoint integrasi POS pakai **cURL** atau **Postman**.
Cocok untuk verifikasi mandiri sebelum POS rekan tim dihubungkan.

- **Base URL:** `http://localhost:4000/api`
- **Swagger (UI interaktif):** `http://localhost:4000/api/docs` → tag **POS**
- **Kredensial admin default:** `admin@wifimanagement.local` / `admin123`

> **Prasyarat:** backend jalan (`npm run start:dev`), PostgreSQL & Redis aktif, dan minimal
> **1 router MikroTik ONLINE** + punya minimal 1 profil hotspot (kalau mau uji generate voucher sukses).

---

## Ringkasan endpoint

| Auth | Verb | Path | Fungsi |
|------|------|------|--------|
| JWT (admin) | POST | `/api/pos-keys` | Buat API key POS (mentah tampil **sekali**) |
| JWT (admin) | GET | `/api/pos-keys` | List API key (ter-mask) |
| JWT (admin) | PATCH | `/api/pos-keys/:id` | Aktif/nonaktifkan key |
| JWT (admin) | DELETE | `/api/pos-keys/:id` | Hapus (revoke) key |
| **x-api-key (POS)** | GET | `/api/pos/v1/profiles` | List paket WiFi per server |
| **x-api-key (POS)** | POST | `/api/pos/v1/trigger-voucher` | Buat voucher baru di MikroTik |

---

# BAGIAN A — cURL (terminal)

> Catatan: contoh pakai **Git Bash / Linux / macOS**. Untuk **CMD/PowerShell Windows**, ganti
> baris-sambung `\` jadi satu baris, dan tanda kutip JSON bisa perlu di-escape (lihat Bagian C).

### Langkah 1 — Login admin, ambil JWT

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wifimanagement.local","password":"admin123"}'
```

**Respons:**
```json
{ "accessToken": "eyJhbGci...", "admin": { "id": "...", "email": "...", "name": "Super Admin" } }
```

Salin `accessToken`. Simpan ke variabel (Bash):
```bash
TOKEN="eyJhbGci...tempel-token-di-sini..."
```

---

### Langkah 2 — Buat API key POS (admin)

```bash
curl -X POST http://localhost:4000/api/pos-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Outlet A"}'
```

**Respons (key mentah hanya tampil SEKALI — wajib disalin):**
```json
{
  "id": "cmqbk...",
  "label": "Outlet A",
  "key": "pos_9cdb854d2840cd599d343a43d39d5cbea0f091457961c078",
  "createdAt": "2026-06-12T...",
  "message": "Simpan key ini sekarang. Key mentah TIDAK akan ditampilkan lagi."
}
```

Simpan key:
```bash
APIKEY="pos_9cdb854d2840cd599d343a43d39d5cbea0f091457961c078"
```

---

### Langkah 3 — Endpoint A: list paket WiFi (POS)

```bash
curl http://localhost:4000/api/pos/v1/profiles \
  -H "x-api-key: $APIKEY"
```

**Respons:**
```json
{
  "servers": [
    {
      "serverId": "cmqa8lvx40009z8us9542d23p",
      "serverName": "LYF",
      "profiles": [
        { "profileId": "cmqa8lw9u000bz8us0tip6xab", "name": "default", "rateLimit": "2M/2M", "validity": "1d", "sharedUsers": 1 },
        { "profileId": "cmqa8vzd5000ez8uslmpztxfn", "name": "1ORANG",  "rateLimit": "1M/2M", "validity": "1d", "sharedUsers": 1 }
      ]
    }
  ]
}
```

Salin `serverId` + `profileId` yang mau dipakai:
```bash
SERVER_ID="cmqa8lvx40009z8us9542d23p"
PROFILE_ID="cmqa8lw9u000bz8us0tip6xab"
```

---

### Langkah 4 — Endpoint B: trigger voucher (POS)

Sistem akan **membuat kode voucher baru langsung di MikroTik**, lalu balas datanya.

```bash
curl -X POST http://localhost:4000/api/pos/v1/trigger-voucher \
  -H "x-api-key: $APIKEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"transactionId\": \"TRX-001\",
    \"serverId\": \"$SERVER_ID\",
    \"profileId\": \"$PROFILE_ID\",
    \"outletName\": \"Outlet A\",
    \"customerName\": \"Budi\"
  }"
```

**Respons 201 (sukses) — siap dicetak di struk POS:**
```json
{
  "transactionId": "TRX-001",
  "voucher": {
    "username": "606701",
    "password": "606701",
    "profileName": "default",
    "rateLimit": "2M/2M",
    "validity": "1d",
    "loginUrl": "http://eg.id/login?username=606701&password=606701",
    "qrBase64": "data:image/png;base64,iVBORw0KGgo...",
    "instructions": "Sambungkan ke WiFi 'LYF' → scan QR atau buka halaman login → masukkan username & password."
  }
}
```

> `qrBase64` = gambar QR siap pakai. Di HTML: `<img src="{qrBase64}" />`.

---

# BAGIAN B — Skenario Uji Penting (wajib dicoba)

Pastikan tiap kondisi memberi hasil benar. **`-i`** menampilkan status HTTP.

### B1. Tanpa API key → **401**
```bash
curl -i http://localhost:4000/api/pos/v1/profiles
# → HTTP/1.1 401 Unauthorized  {"message":"API key tidak valid",...}
```

### B2. API key salah → **401**
```bash
curl -i http://localhost:4000/api/pos/v1/profiles -H "x-api-key: pos_salah123"
# → 401
```

### B3. Idempotensi — `transactionId` SAMA → **200**, voucher SAMA (tidak buat baru)
Jalankan Langkah 4 **dua kali** dengan `transactionId` sama (`TRX-001`):
```bash
# Kedua kali → status 200 (bukan 201), username voucher PERSIS SAMA dengan yang pertama
```

### B4. Transaksi baru — `transactionId` BEDA → voucher BARU
```bash
curl -i -X POST http://localhost:4000/api/pos/v1/trigger-voucher \
  -H "x-api-key: $APIKEY" -H "Content-Type: application/json" \
  -d "{\"transactionId\":\"TRX-002\",\"serverId\":\"$SERVER_ID\",\"profileId\":\"$PROFILE_ID\"}"
# → 201, username voucher BEDA
```

### B5. Server tidak ada → **404**
```bash
curl -i -X POST http://localhost:4000/api/pos/v1/trigger-voucher \
  -H "x-api-key: $APIKEY" -H "Content-Type: application/json" \
  -d "{\"transactionId\":\"TRX-X\",\"serverId\":\"tidak-ada\",\"profileId\":\"$PROFILE_ID\"}"
# → 404 "Server dengan ID tidak-ada tidak ditemukan"
```

### B6. Body invalid (transactionId kosong) → **400**
```bash
curl -i -X POST http://localhost:4000/api/pos/v1/trigger-voucher \
  -H "x-api-key: $APIKEY" -H "Content-Type: application/json" \
  -d "{\"serverId\":\"$SERVER_ID\",\"profileId\":\"$PROFILE_ID\"}"
# → 400 "transactionId tidak boleh kosong"
```

### B7. Router offline → **502** (POS boleh retry dgn transactionId sama)
Matikan/cabut router (atau pakai server yang OFFLINE), lalu trigger:
```bash
# → 502 "Router tidak dapat dijangkau, coba lagi"
# Transaksi tercatat status FAILED; voucher TIDAK dibuat.
```

### B8. Kelola API key (admin)
```bash
# List (ter-mask)
curl http://localhost:4000/api/pos-keys -H "Authorization: Bearer $TOKEN"

# Nonaktifkan (key jadi 401 saat dipakai)
curl -X PATCH http://localhost:4000/api/pos-keys/<KEY_ID> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"isActive":false}'

# Hapus (revoke permanen)
curl -X DELETE http://localhost:4000/api/pos-keys/<KEY_ID> \
  -H "Authorization: Bearer $TOKEN"
```

---

# BAGIAN C — Khusus Windows PowerShell

PowerShell tidak suka cURL JSON yang sama. Pakai `Invoke-RestMethod`:

```powershell
# 1. Login
$login = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admin@wifimanagement.local","password":"admin123"}'
$token = $login.accessToken

# 2. Buat API key
$keyRes = Invoke-RestMethod -Uri "http://localhost:4000/api/pos-keys" -Method POST `
  -ContentType "application/json" -Headers @{Authorization="Bearer $token"} `
  -Body '{"label":"Outlet A"}'
$apiKey = $keyRes.key
$keyRes.key   # ← salin (tampil sekali)

# 3. List profil
$profiles = Invoke-RestMethod -Uri "http://localhost:4000/api/pos/v1/profiles" -Method GET `
  -Headers @{"x-api-key"=$apiKey}
$profiles | ConvertTo-Json -Depth 5
$serverId  = $profiles.servers[0].serverId
$profileId = $profiles.servers[0].profiles[0].profileId

# 4. Trigger voucher
$body = @{ transactionId="TRX-001"; serverId=$serverId; profileId=$profileId; outletName="Outlet A" } | ConvertTo-Json
$v = Invoke-RestMethod -Uri "http://localhost:4000/api/pos/v1/trigger-voucher" -Method POST `
  -ContentType "application/json" -Headers @{"x-api-key"=$apiKey} -Body $body
$v.voucher    # username, password, loginUrl, qrBase64, instructions
```

---

# BAGIAN D — Postman

### Setup awal
1. **Buat Environment** (Postman → Environments → +). Tambah variabel:
   | Variable | Initial Value |
   |----------|---------------|
   | `baseUrl` | `http://localhost:4000/api` |
   | `token`   | *(kosong, diisi otomatis)* |
   | `apiKey`  | *(kosong, isi manual stlh buat key)* |
   | `serverId` | *(isi dari list profil)* |
   | `profileId` | *(isi dari list profil)* |

2. Pilih environment itu di pojok kanan atas.

### Request 1 — Login (auto-simpan token)
- **POST** `{{baseUrl}}/auth/login`
- Body → raw → JSON:
  ```json
  { "email": "admin@wifimanagement.local", "password": "admin123" }
  ```
- Tab **Scripts → Post-response** (auto-simpan token ke environment):
  ```js
  const data = pm.response.json();
  pm.environment.set("token", data.accessToken);
  ```

### Request 2 — Buat API Key
- **POST** `{{baseUrl}}/pos-keys`
- Authorization → **Bearer Token** → `{{token}}`
- Body → raw → JSON: `{ "label": "Outlet A" }`
- Kirim → **salin** field `key` dari respons → tempel ke environment variable `apiKey`.
  (Atau Post-response script: `pm.environment.set("apiKey", pm.response.json().key);`)

### Request 3 — List Profil (POS)
- **GET** `{{baseUrl}}/pos/v1/profiles`
- Headers → tambah: `x-api-key` = `{{apiKey}}`
- Kirim → salin `serverId` + `profileId` ke environment.
  Atau Post-response:
  ```js
  const d = pm.response.json();
  pm.environment.set("serverId", d.servers[0].serverId);
  pm.environment.set("profileId", d.servers[0].profiles[0].profileId);
  ```

### Request 4 — Trigger Voucher (POS)
- **POST** `{{baseUrl}}/pos/v1/trigger-voucher`
- Headers → `x-api-key` = `{{apiKey}}`
- Body → raw → JSON:
  ```json
  {
    "transactionId": "TRX-001",
    "serverId": "{{serverId}}",
    "profileId": "{{profileId}}",
    "outletName": "Outlet A",
    "customerName": "Budi"
  }
  ```
- Kirim → lihat `voucher` di respons.
- **Uji idempotensi:** kirim lagi (transactionId sama) → status **200**, voucher sama.
- **Uji baru:** ubah `transactionId` jadi `TRX-002` → status **201**, voucher baru.

> **Tips melihat QR:** copy nilai `qrBase64` (diawali `data:image/png;base64,`) → tempel di address bar
> browser → QR muncul.

---

# BAGIAN E — Tabel Hasil yang Diharapkan

| Skenario | HTTP | Catatan |
|----------|------|---------|
| List profil dengan key valid | **200** | daftar server + profil |
| Trigger voucher pertama (router online) | **201** | voucher baru dibuat di MikroTik |
| Trigger ulang (transactionId sama) | **200** | voucher SAMA (idempoten) |
| Trigger transactionId baru | **201** | voucher BARU |
| Tanpa / salah / nonaktif API key | **401** | "API key tidak valid" |
| serverId / profileId tidak ada | **404** | "...tidak ditemukan" |
| Body invalid (field wajib kosong) | **400** | pesan validasi Indonesia |
| Router offline saat trigger | **502** | "Router tidak dapat dijangkau, coba lagi" |

---

# BAGIAN F — Verifikasi tambahan (opsional)

**Cek voucher masuk database** (lewat panel admin):
- Buka `/vouchers` di web → voucher hasil trigger muncul (status UNUSED, outlet sesuai).

**Cek log aktivitas:**
- Buka `/logs` → ada entri `POS_VOUCHER_GENERATED` / `POS_TRANSACTION_RECEIVED`.

**Cek audit API key:**
```bash
curl http://localhost:4000/api/pos-keys -H "Authorization: Bearer $TOKEN"
# field lastUsedAt terupdate tiap key dipakai
```

**Bersihkan data uji** (hapus voucher uji via panel `/vouchers` → centang → Hapus, dan
revoke API key uji via DELETE `/pos-keys/:id`).
