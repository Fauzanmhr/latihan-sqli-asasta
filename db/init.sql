-- ============================================================
-- Database & Tabel untuk Perusahaan Air Minum Daerah
-- Demo aplikasi — mengandung kerentanan SQL Injection
-- ============================================================

CREATE DATABASE IF NOT EXISTS pdam_db;
USE pdam_db;

-- Tabel users (pegawai/admin)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  role ENUM('admin', 'operator', 'manager') DEFAULT 'operator',
  nama_lengkap VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel pelanggan
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  no_sambung VARCHAR(20) NOT NULL UNIQUE,
  nama VARCHAR(100) NOT NULL,
  alamat TEXT,
  kecamatan VARCHAR(50),
  kelurahan VARCHAR(50),
  golongan ENUM('R1', 'R2', 'R3', 'NI1', 'NI2', 'I1', 'I2') DEFAULT 'R1',
  tarif_per_m3 DECIMAL(10,2) DEFAULT 2500.00,
  status ENUM('aktif', 'nonaktif', 'sementara') DEFAULT 'aktif',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabel tagihan (bills)
CREATE TABLE IF NOT EXISTS bills (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  bulan INT NOT NULL,
  tahun INT NOT NULL,
  pemakaian_m3 DECIMAL(10,2) DEFAULT 0,
  tagihan DECIMAL(12,2) DEFAULT 0,
  denda DECIMAL(10,2) DEFAULT 0,
  status_bayar ENUM('lunas', 'belum', 'denda') DEFAULT 'belum',
  tgl_bayar DATE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- ============================================================
-- DATA SEED
-- ============================================================

-- Users
INSERT INTO users (username, password, role, nama_lengkap) VALUES
('admin', 'admin123', 'admin', 'Admin Utama PDAM'),
('operator1', 'op12345', 'operator', 'Bambang Supriyadi'),
('manager', 'manager123', 'manager', 'Siti Rahmawati');

-- Customers
INSERT INTO customers (no_sambung, nama, alamat, kecamatan, kelurahan, golongan, tarif_per_m3, status) VALUES
('TA2023001', 'Ahmad Fauzi', 'Jl. Margonda Raya No.45', 'Pancoran Mas', 'Depok', 'R1', 2500, 'aktif'),
('TA2023002', 'Dewi Sartika', 'Perumahan Bumi Depok Indah Blok A12', 'Sukmajaya', 'Baktijaya', 'R2', 3500, 'aktif'),
('TA2023003', 'Hendra Gunawan', 'Jl. Raya Sawangan Km.3', 'Sawangan', 'Sawangan Baru', 'R1', 2500, 'aktif'),
('TA2023004', 'PT Maju Sejahtera', 'Kawasan Industri Pulogadung', 'Cimanggis', 'Mekarsari', 'I1', 7500, 'aktif'),
('TA2023005', 'Rina Marlina', 'Jl. Kober No.10', 'Beji', 'Beji Timur', 'R1', 2500, 'nonaktif'),
('TA2023006', 'SMKN 2 Depok', 'Jl. Raya Bogor Km.36', 'Cimanggis', 'Tugu', 'NI1', 5000, 'aktif'),
('TA2023007', 'Dr. Andika Pratama', 'Vila Bintaro Indah Blok C5', 'Tapos', 'Cilodong', 'R3', 5500, 'aktif'),
('TA2023008', 'Masjid Al-Hidayah', 'Jl. Masjid No.1', 'Limo', 'Krukut', 'NI1', 5000, 'aktif'),
('TA2023009', 'Budi Santoso', 'Gg. Haji Romli No.8', 'Pancoran Mas', 'Pancoran Mas', 'R1', 2500, 'sementara'),
('TA2023010', 'Perusahaan Air Minum Daerah (Kantor Pusat)', 'Jl. Akses UI No.1', 'Beji', 'Kukusan', 'NI2', 4500, 'aktif');

-- Bills (tagihan 3 bulan terakhir)
INSERT INTO bills (customer_id, bulan, tahun, pemakaian_m3, tagihan, denda, status_bayar, tgl_bayar) VALUES
(1, 7, 2026, 25, 62500, 0, 'lunas', '2026-08-05'),
(1, 8, 2026, 30, 75000, 0, 'lunas', '2026-09-02'),
(1, 9, 2026, 28, 70000, 0, 'belum', NULL),
(2, 7, 2026, 45, 157500, 0, 'lunas', '2026-08-10'),
(2, 8, 2026, 52, 182000, 5000, 'denda', '2026-09-15'),
(2, 9, 2026, 48, 168000, 0, 'belum', NULL),
(3, 7, 2026, 18, 45000, 0, 'lunas', '2026-08-01'),
(3, 8, 2026, 20, 50000, 0, 'lunas', '2026-09-01'),
(3, 9, 2026, 15, 37500, 0, 'belum', NULL),
(4, 7, 2026, 320, 2400000, 0, 'lunas', '2026-08-20'),
(4, 8, 2026, 285, 2137500, 0, 'lunas', '2026-09-18'),
(4, 9, 2026, 310, 2325000, 0, 'belum', NULL),
(6, 7, 2026, 95, 475000, 0, 'lunas', '2026-08-12'),
(6, 8, 2026, 88, 440000, 0, 'lunas', '2026-09-10'),
(6, 9, 2026, 102, 510000, 0, 'belum', NULL),
(7, 7, 2026, 55, 302500, 0, 'lunas', '2026-08-03'),
(7, 8, 2026, 60, 330000, 0, 'lunas', '2026-09-05'),
(7, 9, 2026, 58, 319000, 0, 'belum', NULL);
