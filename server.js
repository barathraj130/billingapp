// server.js - minimal express server + simple JSON storage
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const stringify = require('csv-stringify/lib/sync');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);

const INV_FILE = path.join(DB_DIR, 'invoices.json');
const TX_FILE = path.join(DB_DIR, 'transactions.json');

function readJSON(file, def) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(def || [], null, 2));
      return def || [];
    }
    return JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
  } catch (e) {
    console.error('readJSON error', e);
    return def || [];
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data || [], null, 2));
}

/* ---------- API: invoices ---------- */
// GET all invoices
app.get('/api/invoices', (req, res) => {
  const arr = readJSON(INV_FILE, []);
  res.json(arr);
});

// POST new invoice
app.post('/api/invoices', (req, res) => {
  const inv = req.body;
  if (!inv || !inv.id) return res.status(400).json({ error: 'invalid invoice' });
  const arr = readJSON(INV_FILE, []);
  arr.push(inv);
  writeJSON(INV_FILE, arr);

  // also create a transaction entry for dashboard / ledger
  const txs = readJSON(TX_FILE, []);
  txs.push({
    id: 'tx-' + Date.now(),
    date: inv.date || new Date().toISOString().slice(0, 10),
    type: 'income',
    category: 'sales',
    pay: inv.pay || 'Cash',
    amount: Number(inv.total || 0),
    invoiceId: inv.id
  });
  writeJSON(TX_FILE, txs);

  res.json({ ok: true, invoice: inv });
});

// DELETE invoice (moves to trash)
app.delete('/api/invoices/:id', (req, res) => {
  const id = req.params.id;
  let arr = readJSON(INV_FILE, []);
  arr = arr.filter(i => i.id !== id);
  writeJSON(INV_FILE, arr);
  res.json({ ok: true });
});

/* ---------- API: transactions ---------- */
// GET all transactions (with optional filter ?type=income|expense)
app.get('/api/transactions', (req, res) => {
  let arr = readJSON(TX_FILE, []);
  if (req.query.type) arr = arr.filter(t => t.type === req.query.type);
  res.json(arr);
});

// POST transaction (manual add)
app.post('/api/transactions', (req, res) => {
  const tx = req.body;
  if (!tx || !tx.amount) return res.status(400).json({ error: 'invalid tx' });
  const txs = readJSON(TX_FILE, []);
  txs.push(Object.assign({ id: 'tx-' + Date.now() }, tx));
  writeJSON(TX_FILE, txs);
  res.json({ ok: true, tx: txs[txs.length - 1] });
});

/* ---------- API: export CSV ---------- */
// Export all invoices as CSV
app.get('/api/export/invoices/csv', (req, res) => {
  const invs = readJSON(INV_FILE, []);
  const rows = invs.map(i => ({
    id: i.id,
    date: i.date,
    customer: i.customer || '',
    pay: i.pay || '',
    total: i.total || 0
  }));
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-disposition', 'attachment; filename=invoices.csv');
  res.set('Content-Type', 'text/csv');
  res.send(csv);
});

// Export transactions as CSV (optional ?type=cash|gpay|all)
app.get('/api/export/transactions/csv', (req, res) => {
  const txs = readJSON(TX_FILE, []);
  const csv = stringify(txs, { header: true });
  res.setHeader('Content-disposition', 'attachment; filename=transactions.csv');
  res.set('Content-Type', 'text/csv');
  res.send(csv);
});

/* ---------- API: EOD export (zip-like single CSVs) ---------- */
app.get('/api/export/eod', (req, res) => {
  const invs = readJSON(INV_FILE, []);
  const txs = readJSON(TX_FILE, []);
  // combine into one CSV for convenience
  const rows = invs.map(i => ({
    id: i.id, date: i.date, customer: i.customer, pay: i.pay, total: i.total
  }));
  const invCSV = stringify(rows, { header: true });
  const txCSV = stringify(txs, { header: true });
  // simple JSON package response (client can download both)
  res.json({ invoices: invCSV, transactions: txCSV });
});

/* ---------- Serve UI ---------- */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log('Server running on port', PORT));
