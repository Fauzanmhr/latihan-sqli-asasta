require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rahasia',
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- DB pool ---
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pdam_tirta_asasta',
  waitForConnections: true
});

// ============================================================
// AUTH HELPERS
// ============================================================

// Session auth (for views)
function requireViewAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Token auth (for API)
const tokens = new Map();
let tokenSeq = 1;

function requireApiAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = tokens.get(token);
  next();
}

// ============================================================
// VIEW ROUTES — Halaman HTML (juga rentan SQLi)
// ============================================================

// --- Landing page (public) ---
app.get('/', (req, res) => {
  const no_sambung = req.query.no_sambung || '';
  if (!no_sambung) return res.render('index', { user: req.session.user || null, error: null, bills: null, no_sambung: '' });

  try {
    const sql = `SELECT b.*, c.nama, c.alamat, c.kecamatan FROM bills b JOIN customers c ON b.customer_id = c.id WHERE c.no_sambung = '${no_sambung}'`;
    console.log('[LANDING SEARCH]', sql);

    pool.query(sql).then(([rows]) => {
      res.render('index', { user: req.session.user || null, error: null, bills: rows, no_sambung });
    }).catch(err => {
      res.render('index', { user: req.session.user || null, error: err.message, bills: null, no_sambung });
    });
  } catch (err) {
    res.render('index', { user: req.session.user || null, error: err.message, bills: null, no_sambung });
  }
});

// --- Login page ---
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// --- 🔥 VULN: Login ---
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const sql = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    console.log('[VIEW LOGIN]', sql);
    const [rows] = await pool.query(sql);
    if (rows.length > 0) {
      req.session.user = rows[0];
      res.redirect('/dashboard');
    } else {
      res.render('login', { error: 'Username atau password salah!' });
    }
  } catch (err) {
    res.render('login', { error: err.message });
  }
});

// --- Dashboard ---
app.get('/dashboard', requireViewAuth, async (req, res) => {
  try {
    const [[{ total: totalPelanggan }]] = await pool.query('SELECT COUNT(*) AS total FROM customers');
    const [[{ total: tagihanBelum }]] = await pool.query('SELECT COUNT(*) AS total FROM bills WHERE status_bayar = "belum"');
    const [[{ total: totalPiutang }]] = await pool.query('SELECT SUM(tagihan) AS total FROM bills WHERE status_bayar = "belum"');
    res.render('dashboard', {
      user: req.session.user,
      stats: { totalPelanggan, tagihanBelum, totalPiutang: totalPiutang || 0 }
    });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// --- 🔥 VULN: Customer list + search ---
app.get('/customers', requireViewAuth, async (req, res) => {
  const search = req.query.search || '';
  try {
    let rows, message;
    if (search) {
      const sql = `SELECT * FROM customers WHERE nama LIKE '%${search}%' OR no_sambung LIKE '%${search}%'`;
      console.log('[VIEW SEARCH]', sql);
      [rows] = await pool.query(sql);
      message = `Hasil untuk: "${search}"`;
    } else {
      [rows] = await pool.query('SELECT * FROM customers ORDER BY id');
      message = 'Semua data pelanggan';
    }
    res.render('customers', { user: req.session.user, customers: rows, search, message });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// --- 🔥 VULN: Customer detail ---
app.get('/customer/:id', requireViewAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const sql = `SELECT * FROM customers WHERE id = ${id}`;
    console.log('[VIEW DETAIL]', sql);
    const [customers] = await pool.query(sql);
    if (!customers.length) return res.status(404).send('Pelanggan tidak ditemukan');
    const [bills] = await pool.query('SELECT * FROM bills WHERE customer_id = ? ORDER BY tahun DESC, bulan DESC', [customers[0].id]);
    res.render('detail', { user: req.session.user, customer: customers[0], bills });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// --- Edit form ---
app.get('/customer/:id/edit', requireViewAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const [customers] = await pool.query(`SELECT * FROM customers WHERE id = ${id}`);
    if (!customers.length) return res.status(404).send('Pelanggan tidak ditemukan');
    res.render('edit', { user: req.session.user, customer: customers[0] });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// --- 🔥 VULN: Update customer ---
app.post('/customer/:id/edit', requireViewAuth, async (req, res) => {
  const id = req.params.id;
  const { nama, alamat, kecamatan, kelurahan, golongan, status } = req.body;
  try {
    const sql = `UPDATE customers SET nama='${nama}', alamat='${alamat}', kecamatan='${kecamatan}', kelurahan='${kelurahan}', golongan='${golongan}', status='${status}' WHERE id = ${id}`;
    console.log('[VIEW UPDATE]', sql);
    await pool.query(sql);
    res.redirect('/customer/' + id);
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// --- 🔥 VULN: Bill detail ---
app.get('/bill/:id', requireViewAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const sql = `SELECT b.*, c.nama, c.no_sambung FROM bills b JOIN customers c ON b.customer_id = c.id WHERE b.id = ${id}`;
    console.log('[VIEW BILL]', sql);
    const [rows] = await pool.query(sql);
    if (!rows.length) return res.status(404).send('Tagihan tidak ditemukan');
    res.render('bill', { user: req.session.user, bill: rows[0] });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// --- 🔥 VULN: Pembayaran tagihan ---
app.get('/bill/:id/pay', requireViewAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await pool.query(`SELECT b.*, c.nama, c.no_sambung FROM bills b JOIN customers c ON b.customer_id = c.id WHERE b.id = ${id}`);
    if (!rows.length) return res.status(404).send('Tagihan tidak ditemukan');
    res.render('pay', { user: req.session.user, bill: rows[0], error: null, success: null });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

app.post('/bill/:id/pay', requireViewAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const sql = `UPDATE bills SET status_bayar='lunas', tgl_bayar=CURDATE() WHERE id = ${id}`;
    console.log('[VIEW PAY]', sql);
    await pool.query(sql);

    const [rows] = await pool.query(`SELECT b.*, c.nama, c.no_sambung FROM bills b JOIN customers c ON b.customer_id = c.id WHERE b.id = ${id}`);
    res.render('pay', { user: req.session.user, bill: rows[0], error: null, success: 'Pembayaran berhasil!' });
  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

// --- 🔥 VULN: CSV Export ---
app.get('/export', requireViewAuth, async (req, res) => {
  const table = req.query.table || 'customers';
  try {
    const sql = `SELECT * FROM ${table}`;
    console.log('[VIEW EXPORT]', sql);
    const [rows] = await pool.query(sql);
    res.set('Content-Type', 'text/plain');
    let output = '';
    if (rows.length) {
      output += Object.keys(rows[0]).join(',') + '\n';
      rows.forEach(r => output += Object.values(r).join(',') + '\n');
    }
    res.send(output);
  } catch (err) {
    res.status(500).send('Export error: ' + err.message);
  }
});

// --- Logout ---
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ============================================================
// INPUT METER BULANAN (rentan SQLi)
// ============================================================

app.get('/meter', requireViewAuth, (req, res) => {
  res.render('meter', { user: req.session.user, error: null, success: null, customer: null });
});

app.post('/meter', requireViewAuth, async (req, res) => {
  const { customer_id, bulan, tahun, pemakaian_m3 } = req.body;

  try {
    // 🔴 VULN: SQL Injection via all fields — pemakaian_m3 bisa subquery
    const sql = `INSERT INTO bills (customer_id, bulan, tahun, pemakaian_m3, tagihan, status_bayar) SELECT ${customer_id}, ${bulan}, ${tahun}, ${pemakaian_m3}, ${pemakaian_m3} * tarif_per_m3, 'belum' FROM customers WHERE id = ${customer_id}`;
    console.log('[INSERT METER]', sql);

    const [result] = await pool.query(sql);

    const [newBill] = await pool.query(`SELECT b.*, c.nama, c.no_sambung FROM bills b JOIN customers c ON b.customer_id = c.id WHERE b.id = ${result.insertId}`);
    res.render('meter', { user: req.session.user, error: null, success: 'Tagihan berhasil dibuat!', customer: newBill[0] });
  } catch (err) {
    res.render('meter', { user: req.session.user, error: err.message, success: null, customer: null });
  }
});

// ============================================================
// REST API ROUTES — JSON (juga rentan SQLi)
// ============================================================

// --- 🔥 VULN: API Login ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const sql = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    console.log('[API LOGIN]', sql);
    const [rows] = await pool.query(sql);
    if (rows.length > 0) {
      const token = 'tok_' + (tokenSeq++);
      tokens.set(token, rows[0]);
      res.json({ token, user: rows[0] });
    } else {
      res.status(401).json({ error: 'Username atau password salah' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🔥 VULN: API Customer list + search ---
app.get('/api/customers', requireApiAuth, async (req, res) => {
  const search = req.query.search || '';
  try {
    let rows;
    if (search) {
      const sql = `SELECT * FROM customers WHERE nama LIKE '%${search}%' OR no_sambung LIKE '%${search}%'`;
      console.log('[API SEARCH]', sql);
      [rows] = await pool.query(sql);
    } else {
      [rows] = await pool.query('SELECT * FROM customers ORDER BY id');
    }
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🔥 VULN: API Customer detail ---
app.get('/api/customers/:id', requireApiAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const sql = `SELECT * FROM customers WHERE id = ${id}`;
    console.log('[API DETAIL]', sql);
    const [customers] = await pool.query(sql);
    if (!customers.length) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    const [bills] = await pool.query('SELECT * FROM bills WHERE customer_id = ? ORDER BY tahun DESC, bulan DESC', [customers[0].id]);
    res.json({ customer: customers[0], bills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🔥 VULN: API Update customer ---
app.put('/api/customers/:id', requireApiAuth, async (req, res) => {
  const id = req.params.id;
  const { nama, alamat, kecamatan, kelurahan, golongan, status } = req.body;
  try {
    const sql = `UPDATE customers SET nama='${nama}', alamat='${alamat}', kecamatan='${kecamatan}', kelurahan='${kelurahan}', golongan='${golongan}', status='${status}' WHERE id = ${id}`;
    console.log('[API UPDATE]', sql);
    await pool.query(sql);
    const [updated] = await pool.query(`SELECT * FROM customers WHERE id = ${id}`);
    res.json({ message: 'Pelanggan berhasil diupdate', customer: updated[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🔥 VULN: API Bill detail ---
app.get('/api/bills/:id', requireApiAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const sql = `SELECT b.*, c.nama, c.no_sambung FROM bills b JOIN customers c ON b.customer_id = c.id WHERE b.id = ${id}`;
    console.log('[API BILL]', sql);
    const [rows] = await pool.query(sql);
    if (!rows.length) return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
    res.json({ bill: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🔥 VULN: API Export ---
app.get('/api/export', requireApiAuth, async (req, res) => {
  const table = req.query.table || 'customers';
  try {
    const sql = `SELECT * FROM ${table}`;
    console.log('[API EXPORT]', sql);
    const [rows] = await pool.query(sql);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API Logout ---
app.post('/api/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) tokens.delete(token);
  res.json({ message: 'Logged out' });
});

// --- 🔥 VULN: API Bayar tagihan ---
app.put('/api/bills/:id/pay', requireApiAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const sql = `UPDATE bills SET status_bayar='lunas', tgl_bayar=CURDATE() WHERE id = ${id}`;
    console.log('[API PAY]', sql);
    await pool.query(sql);
    const [rows] = await pool.query(`SELECT b.*, c.nama, c.no_sambung FROM bills b JOIN customers c ON b.customer_id = c.id WHERE b.id = ${id}`);
    res.json({ message: 'Pembayaran berhasil', bill: rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🔥 VULN: API Cek tagihan publik (tanpa auth) ---
app.get('/api/cek-tagihan', async (req, res) => {
  const no_sambung = req.query.no_sambung || '';
  if (!no_sambung) return res.status(400).json({ error: 'Parameter no_sambung diperlukan' });
  try {
    const sql = `SELECT b.*, c.nama, c.alamat, c.kecamatan FROM bills b JOIN customers c ON b.customer_id = c.id WHERE c.no_sambung = '${no_sambung}'`;
    console.log('[API CEK TAGIHAN]', sql);
    const [rows] = await pool.query(sql);
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 🔥 VULN: API Input meter ---
app.post('/api/meter', requireApiAuth, async (req, res) => {
  const { customer_id, bulan, tahun, pemakaian_m3 } = req.body;
  if (!customer_id || !bulan || !tahun || !pemakaian_m3) {
    return res.status(400).json({ error: 'customer_id, bulan, tahun, pemakaian_m3 required' });
  }
  try {
    const sql = `INSERT INTO bills (customer_id, bulan, tahun, pemakaian_m3, tagihan, status_bayar) SELECT ${customer_id}, ${bulan}, ${tahun}, ${pemakaian_m3}, ${pemakaian_m3} * tarif_per_m3, 'belum' FROM customers WHERE id = ${customer_id}`;
    console.log('[API INSERT METER]', sql);
    const [result] = await pool.query(sql);
    const [newBill] = await pool.query(`SELECT b.*, c.nama, c.no_sambung FROM bills b JOIN customers c ON b.customer_id = c.id WHERE b.id = ${result.insertId}`);
    res.json({ message: 'Tagihan berhasil dibuat', bill: newBill[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SERVER START
// ============================================================
app.listen(PORT, () => {
  console.log(`🔓 PDAM Tirta Asasta Depok — http://localhost:${PORT}`);
  console.log(`   👉 Buka browser for views`);
  console.log(`   👉 API: /api/* (Authorization: Bearer <token>)`);
  console.log('⚠️  Semua endpoint mengandung SQL Injection — hanya untuk demo/edukasi!');
});
