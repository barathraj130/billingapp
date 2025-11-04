// server.js - PostgreSQL ready backend for Render deployment
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const stringify = require('csv-stringify/lib/sync');

// 1. Initialize the PostgreSQL database connection and schema
require('./models/db'); 

// 2. Import dedicated API routers (now using PG internally)
const invoiceRoutes = require('./routes/invoices');
const transactionRoutes = require('./routes/transactions');
const reportRoutes = require('./routes/reports');
const resetRoutes = require('./routes/reset'); 

// 3. Import Models for direct data querying (exports/EOD)
const InvoiceModel = require('./models/invoiceModel');
const TransactionModel = require('./models/transactionModel');


const app = express();
// PORT is essential for Render
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

app.use('/api/invoices', invoiceRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/reset', resetRoutes);

/* ---------- API: export CSV (Using PostgreSQL Models) ---------- */

// Export all invoices as CSV
app.get('/api/export/invoices/csv', async (req, res) => {
  try {
    const invs = await InvoiceModel.list();
    const rows = invs.map(i => ({
      id: i.id,
      invoice_no: i.invoice_no,
      date: i.date,
      customer_name: i.customer_name || '',
      subtotal: i.subtotal,
      tax: i.tax,
      total: i.total
    }));
    const csv = stringify(rows, { header: true });
    res.setHeader('Content-disposition', 'attachment; filename=invoices.csv');
    res.set('Content-Type', 'text/csv');
    res.send(csv);
  } catch (e) {
    console.error("Error exporting invoices:", e);
    res.status(500).send("Error exporting invoices: " + e.message);
  }
});

// Export transactions as CSV (handles filter parameters from query)
app.get('/api/export/transactions/csv', async (req, res) => {
  try {
    const txs = await TransactionModel.list(req.query);
    const csv = stringify(txs, { header: true });
    res.setHeader('Content-disposition', 'attachment; filename=transactions.csv');
    res.set('Content-Type', 'text/csv');
    res.send(csv);
  } catch (e) {
    console.error("Error exporting transactions:", e);
    res.status(500).send("Error exporting transactions: " + e.message);
  }
});

/* ---------- API: EOD export ---------- */
app.get('/api/export/eod', async (req, res) => {
  try {
    const invs = await InvoiceModel.list();
    const txs = await TransactionModel.list();

    const invRows = invs.map(i => ({
        id: i.id, invoice_no: i.invoice_no, date: i.date, total: i.total
    }));
    const invCSV = stringify(invRows, { header: true });
    
    const txCSV = stringify(txs, { header: true });
    
    res.json({ invoices: invCSV, transactions: txCSV });
  } catch (e) {
    console.error("Error performing EOD export:", e);
    res.status(500).json({ error: "EOD Export failed: " + e.message });
  }
});


/* ---------- Serve UI (SPA fallback) ---------- */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log('Server running on port', PORT));