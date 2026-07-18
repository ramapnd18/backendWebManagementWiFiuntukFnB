# API — Monitoring (Real-time Router)

**Modul:** `monitoring` (`MonitoringController` + `MonitoringService`).
**Status:** ✅ terverifikasi runtime 2026-07-16 (router uji MikroTik CHR 7.19.3 `192.168.56.101:8728`, ONLINE).
**Base URL:** `http://localhost:4000/api`

Menarik data real-time dari router MikroTik via **RouterOS API binary** (bukan REST): sesi hotspot aktif,
resource hardware (CPU/RAM/HDD/uptime), dan traffic per-interface (RX/TX). Endpoint `snapshot`
menggabungkan ketiganya dalam **satu koneksi** (1 login + 3 perintah) untuk menekan beban router
saat auto-refresh dashboard.

---

## Konsep & Aturan

- **Scoping:** setiap endpoint memuat server lalu `assertOwnerAccess()`. SUPER_ADMIN = semua;
  OWNER = router miliknya; TEKNISI = router milik Owner-nya. Router milik Owner lain → **403**.
- **Pembagian role:** `active`, `resources`, `snapshot` = **TEKNISI + SUPER_ADMIN** (data teknis).
  `traffic` (TX/RX) = **OWNER (read-only) + TEKNISI + SUPER_ADMIN** — Owner boleh memantau pemakaian
  bandwidth router miliknya.
- **Router tak terjangkau:** kegagalan koneksi/perintah ke router BUKAN error server kami → dibungkus
  jadi **502 Bad Gateway** (`"<konteks>: router tidak dapat dihubungi"`), bukan 500, agar dashboard
  yang polling tidak spam error.
- **Router tidak terdaftar:** **404** `"Server MikroTik dengan ID \"...\" tidak ditemukan"`.

---

## Matriks Akses

| Endpoint | SUPER_ADMIN | OWNER | TEKNISI |
|----------|:-:|:-:|:-:|
| `GET /monitoring/snapshot/:serverId` | ✅ | ❌ 403 | ✅ |
| `GET /monitoring/active/:serverId` | ✅ | ❌ 403 | ✅ |
| `GET /monitoring/resources/:serverId` | ✅ | ❌ 403 | ✅ |
| `GET /monitoring/traffic/:serverId` | ✅ | ✅ (miliknya) | ✅ |

> Semua endpoint butuh JWT (`@UseGuards(JwtAuthGuard, RolesGuard)`). Tanpa token → **401**.

---

## Endpoint

### 1. Snapshot gabungan — `GET /api/monitoring/snapshot/:serverId`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Active users + resources + traffic dalam satu koneksi router.
Dipakai auto-refresh dashboard.

**Response 200 (Success)**
```jsonc
{
  "serverId": "cmq...",
  "activeUsers": [],
  "resources": {
    "serverId": "cmq...",
    "serverName": "CHR-Lab",
    "uptime": "4h46m",
    "cpuLoad": 4,
    "cpuCount": 1,
    "freeMemory": 0,
    "totalMemory": 0,
    "freeHddSpace": 0,
    "totalHddSpace": 0,
    "version": "7.19.3 (stable)",
    "boardName": "CHR innotek GmbH VirtualBox",
    "architectureName": "x86_64"
  },
  "traffic": [ { "name": "ether1", "rxByte": 0, "txByte": 0, "rxPacket": 0, "txPacket": 0 } ]
}
```

**Response 403 (Error — Owner mencoba)**
```json
{ "statusCode": 403, "message": "Anda tidak punya hak akses untuk resource ini", "error": "Forbidden" }
```

**Response 404 / 502:** router tidak ditemukan / router tidak dapat dihubungi.

---

### 2. Sesi hotspot aktif — `GET /api/monitoring/active/:serverId`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Daftar user hotspot yang sedang online.

**Response 200 (Success)**
```jsonc
[
  {
    "id": "*1",
    "username": "738142",
    "ipAddress": "10.5.50.2",
    "macAddress": "AA:BB:CC:DD:EE:FF",
    "uptime": "5m12s",
    "bytesIn": 10240,
    "bytesOut": 20480,
    "sessionTimeLeft": null,
    "idleTime": null
  }
]
```
> Saat tidak ada sesi → `[]`.

**Response 403 (Error — Owner mencoba):** Owner tak boleh `active`/`resources`/`snapshot`.

---

### 3. Resource hardware — `GET /api/monitoring/resources/:serverId`

Butuh JWT (**TEKNISI / SUPER_ADMIN**). Statistik CPU, RAM, HDD, uptime, versi & board router.

**Response 200 (Success)**
```jsonc
{
  "serverId": "cmq...",
  "serverName": "CHR-Lab",
  "uptime": "4h46m",
  "cpuLoad": 4,
  "cpuCount": 1,
  "freeMemory": 0,
  "totalMemory": 0,
  "freeHddSpace": 0,
  "totalHddSpace": 0,
  "version": "7.19.3 (stable)",
  "boardName": "CHR innotek GmbH VirtualBox",
  "architectureName": "x86_64"
}
```

**Response 403 / 404 / 502:** Owner mencoba / router tidak ditemukan / router tidak dapat dihubungi.

---

### 4. Traffic per-interface — `GET /api/monitoring/traffic/:serverId`

Butuh JWT (**OWNER read-only / TEKNISI / SUPER_ADMIN**, ter-scope). RX/TX bytes & packet tiap interface.

**Response 200 (Success)**
```jsonc
[
  {
    "id": "*1",
    "name": "ether1",
    "type": "ether",
    "mtu": 1500,
    "macAddress": "AA:BB:CC:DD:EE:FF",
    "rxByte": 123456,
    "txByte": 654321,
    "rxPacket": 1000,
    "txPacket": 900,
    "running": true,
    "disabled": false
  }
]
```

**Response 404 / 502:** router tidak ditemukan / router tidak dapat dihubungi.

---

## Hasil Uji Runtime (2026-07-16)

Router uji `CHR-Lab` (dimiliki owner). Akun: admin (SUPER_ADMIN), owner (OWNER), teknisi (TEKNISI milik owner).

| Skenario | Verb / Path | Aktor | HTTP | Hasil |
|----------|-------------|-------|:----:|-------|
| Resource hardware | `GET /monitoring/resources/:id` | teknisi | **200** | `{serverName:"CHR-Lab",uptime:"4h46m",cpuLoad:4,cpuCount:1,version:"7.19.3 (stable)",boardName:"CHR innotek GmbH VirtualBox",architectureName:"x86_64",...}` |
| Traffic per-interface | `GET /monitoring/traffic/:id` | owner | **200** | Array interface `[{name:"ether1",rxByte,txByte,rxPacket,txPacket,...}]` |
| Active users (Owner ditolak) | `GET /monitoring/active/:id` | owner | **403** | Owner tak boleh `active`/`resources`/`snapshot` |
| Snapshot gabungan | `GET /monitoring/snapshot/:id` | teknisi | **200** | `{activeUsers:[],resources:{...},traffic:[...]}` |

---

## Histori Healthcheck (Monitoring Outlet) — 2026-07-18

Sumber: [`../2026-07-17-peta-endpoint-backend-untuk-frontend.md`](../2026-07-17-peta-endpoint-backend-untuk-frontend.md) (B2).
Berbeda dari endpoint real-time di atas: ini **histori tersimpan** dari cek periodik.

**Scheduler** `ServerHealthScheduler` (`backend/src/modules/servers/server-health.scheduler.ts`)
men-`testConnection` semua router tiap tick (default 30s, `SERVER_HEALTH_INTERVAL_MS`) lalu menulis
**1 baris `RouterHealthCheck` per router untuk SETIAP hasil** (ONLINE **dan** OFFLINE) ke tabel
`router_health_checks`. **Retensi** default 30 hari (`HEALTH_RETENTION_DAYS`), di-prune berkala.

> Beda dari [`activity-log/router-connections`](./activity-log.md) yang **hanya** mencatat kegagalan.

### `GET /monitoring/health` (OWNER/TEKNISI/SUPER_ADMIN, ter-scope)
```
GET /monitoring/health?serverId=&from=&to=&skip=&take=
```
```jsonc
{
  "data": [
    { "id":"...", "serverId":"...", "serverName":"Outlet A",
      "status":"ONLINE", "latencyMs":12, "checkedAt":"2026-07-18T10:31:00Z" }
  ],
  "meta": { "total": 4320, "skip": 0, "take": 50 }
}
```

### `GET /monitoring/health/summary` (agregat uptime per hari)
```
GET /monitoring/health/summary?serverId=&days=30
```
```jsonc
{ "data": [ { "date":"2026-07-18", "checks":1440, "fails":3, "uptimePct":99.79, "downtimeMinutes":3 } ] }
```
`downtimeMinutes ≈ (fails/checks) × 1440` (independen interval scheduler).

**Uji (2026-07-18):** OWNER **200** (histori `CHR-Lab` tercatat, membuktikan cek gagal pun tersimpan) ·
summary **200** (`uptimePct`, `downtimeMinutes`) · TEKNISI **200** (ter-scope).
