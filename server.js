// server.js
// JBS Knit Wear — Billing System (Server) with sequential invoice numbers

const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'billing.db');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ensure DB file
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '');

const db = new sqlite3.Database(DB_FILE);

// Initialize schema (tables + meta)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      category TEXT,
      amount REAL,
      date TEXT,
      reference TEXT,
      notes TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE,
      date TEXT,
      customer_name TEXT,
      subtotal REAL,
      tax REAL,
      total REAL,
      notes TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      description TEXT,
      qty INTEGER,
      unit_price REAL,
      discount REAL,
      line_total REAL,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id)
    )
  `);

  // meta table to store counters like invoice_seq
  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

// Helper — get next invoice sequence (atomic-ish using DB statements)
// callback(err, seqNumber)
function getNextInvoiceSeq(callback) {
  // We'll use a transaction to ensure atomic increment
  db.serialize(() => {
    db.get("SELECT value FROM meta WHERE key = 'invoice_seq'", (err, row) => {
      if (err) return callback(err);
      if (!row) {
        // insert initial value = 1
        db.run("INSERT INTO meta (key, value) VALUES ('invoice_seq', '1')", function (insErr) {
          if (insErr) return callback(insErr);
          return callback(null, 1);
        });
      } else {
        const cur = parseInt(row.value || '0', 10) || 0;
        const next = cur + 1;
        db.run("UPDATE meta SET value = ? WHERE key = 'invoice_seq'", [String(next)], function (updErr) {
          if (updErr) return callback(updErr);
          return callback(null, next);
        });
      }
    });
  });
}

// Format invoice number: INV-YYYYMMDD-xxxx
function formatInvoiceNo(dateStr, seq) {
  const d = (dateStr || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const seqPadded = String(seq).padStart(4, '0');
  return `INV-${d}-${seqPadded}`;
}

// ------------------- Transactions API -------------------
app.get('/api/transactions', (req, res) => {
  const { from, to } = req.query;
  let query = 'SELECT * FROM transactions ORDER BY date DESC, id DESC';
  const params = [];
  if (from && to) {
    query = 'SELECT * FROM transactions WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC';
    params.push(from, to);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/transactions', (req, res) => {
  const { type, category, amount, date, reference, notes } = req.body;
  if (!type || !amount) return res.status(400).json({ error: 'Type and amount required' });
  db.run(
    `INSERT INTO transactions (type, category, amount, date, reference, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    [type, category, amount, date, reference, notes],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

// ------------------- Invoices API -------------------
app.get('/api/invoices', (req, res) => {
  const { q } = req.query;
  let query = 'SELECT * FROM invoices ORDER BY id DESC';
  const params = [];
  if (q) {
    query = 'SELECT * FROM invoices WHERE invoice_no LIKE ? OR customer_name LIKE ? ORDER BY id DESC';
    params.push(`%${q}%`, `%${q}%`);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/invoices', (req, res) => {
  const { invoice_no, date, customer_name, subtotal, tax, total, notes, items } = req.body;
  if (!date || !items || !items.length) {
    return res.status(400).json({ error: 'Invalid invoice data' });
  }

  // If invoice_no provided by client, use it; otherwise generate sequential invoice number using meta counter.
  function createInvoiceUsing(invoiceNumber) {
    db.run(
      `INSERT INTO invoices (invoice_no, date, customer_name, subtotal, tax, total, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, date, customer_name, subtotal, tax, total, notes],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const invoiceId = this.lastID;
        const stmt = db.prepare(
          `INSERT INTO invoice_items (invoice_id, description, qty, unit_price, discount, line_total) VALUES (?, ?, ?, ?, ?, ?)`
        );
        items.forEach((it) => {
          stmt.run(invoiceId, it.description, it.qty, it.unit_price, it.discount, it.line_total);
        });
        stmt.finalize((err2) => {
          if (err2) console.warn('invoice_items finalize warning', err2);
          // Also insert an income transaction for this invoice
          db.run(
            `INSERT INTO transactions (type, category, amount, date, reference, notes) VALUES (?, ?, ?, ?, ?, ?)`,
            ['income', 'sales', total, date, invoiceNumber, 'Invoice generated'],
            (err3) => {
              if (err3) console.warn('transaction insert failed', err3);
              // respond to client
              res.json({ success: true, id: invoiceId, invoice_no: invoiceNumber });
            }
          );
        });
      }
    );
  }

  if (invoice_no && String(invoice_no).trim()) {
    // client gave invoice number - use as-is
    createInvoiceUsing(invoice_no.trim());
  } else {
    // generate sequence then create
    getNextInvoiceSeq((err, seq) => {
      if (err) {
        console.error('Failed to get next invoice seq:', err);
        return res.status(500).json({ error: 'Failed to generate invoice number' });
      }
      const invNo = formatInvoiceNo(date, seq);
      createInvoiceUsing(invNo);
    });
  }
});

app.delete('/api/invoices/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [id], (err) => {
    if (err) console.warn('delete invoice_items err', err);
    db.run('DELETE FROM invoices WHERE id = ?', [id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ success: true });
    });
  });
});

// ------------------- Reports -------------------
app.get('/api/reports/summary', (req, res) => {
  const { from, to } = req.query;
  let queryIncome = 'SELECT SUM(amount) as total FROM transactions WHERE type = "income"';
  let queryExpense = 'SELECT SUM(amount) as total FROM transactions WHERE type = "expense"';
  const params = [];
  if (from && to) {
    queryIncome += ' AND date BETWEEN ? AND ?';
    queryExpense += ' AND date BETWEEN ? AND ?';
    params.push(from, to);
  }
  db.get(queryIncome, params, (err, incomeRow) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(queryExpense, params, (err2, expenseRow) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({
        income: incomeRow && incomeRow.total ? incomeRow.total : 0,
        expense: expenseRow && expenseRow.total ? expenseRow.total : 0,
      });
    });
  });
});

// ------------------- Reset endpoint -------------------
app.post('/api/reset', (req, res) => {
  const body = req.body || {};
  console.log('/api/reset body:', body);

  if (!body.confirm || String(body.confirm) !== 'RESET') {
    return res.status(400).json({ error: "You must provide confirm: 'RESET' to proceed." });
  }

  try {
    const backupPath = `${DB_FILE}.bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(DB_FILE, backupPath);

    // Delete all user data and reset the invoice_seq meta so numbering restarts
    db.serialize(() => {
      db.run('DELETE FROM transactions');
      db.run('DELETE FROM invoice_items');
      db.run('DELETE FROM invoices');
      db.run("DELETE FROM meta WHERE key = 'invoice_seq'");
      // Optionally reset sqlite_sequence entries (if you rely on AUTOINCREMENT)
      db.run("DELETE FROM sqlite_sequence WHERE name IN ('transactions','invoices','invoice_items')");
    });

    res.json({ success: true, backup: backupPath });
  } catch (err) {
    console.error('Reset failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------- Simple health / root -------------------
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start server
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
