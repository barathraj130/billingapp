const express = require('express');
const router = express.Router();
const Invoice = require('../models/invoiceModel');
const db = require('../models/db');

// generate invoice no (date + counter)
function generateInvoiceNo() {
  return new Promise((resolve, reject) => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const prefix = `INV-${y}${m}${d}`;

    db.get(`SELECT COUNT(*) as c FROM invoices WHERE invoice_no LIKE ?`, [prefix + '%'], (err, row) => {
      if (err) return reject(err);
      const next = (row && row.c ? row.c + 1 : 1);
      const invoiceNo = `${prefix}-${String(next).padStart(4, '0')}`;
      resolve(invoiceNo);
    });
  });
}

// Try creating invoice with retry on UNIQUE constraint failure
async function tryCreateInvoice(payload, maxRetries = 5) {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    try {
      // ensure invoice_no exists
      if (!payload.invoice_no) {
        payload.invoice_no = await generateInvoiceNo();
      }

      const result = await Invoice.create(payload, payload.items || []);
      // fetch the full invoice back
      const created = await Invoice.getById(result.id);

      // create a transaction record for this invoice (income)
      const total = parseFloat(payload.total || payload.subtotal || 0);
      const nowDate = payload.date || new Date().toISOString().slice(0,10);
      if (!isNaN(total) && total > 0) {
        db.run(
          `INSERT INTO transactions (type, category, amount, date, reference, notes) VALUES (?,?,?,?,?,?)`,
          ['income', 'sales', total, nowDate, payload.invoice_no, `Invoice #${payload.invoice_no}`],
          function(err) {
            if (err) console.error('Failed to insert transaction for invoice', err);
          }
        );
      }

      return created; // success
    } catch (err) {
      // handle SQLITE_CONSTRAINT: UNIQUE constraint failed: invoices.invoice_no
      if (err && err.message && err.message.includes('SQLITE_CONSTRAINT')) {
        console.warn(`Invoice create attempt ${attempts} failed due to constraint. Regenerating invoice_no and retrying...`);
        // regenerate invoice_no and retry
        payload.invoice_no = undefined; // force regenerate on next loop
        if (attempts >= maxRetries) throw new Error('Failed to generate unique invoice number after multiple attempts.');
        // small loop delay could be added if needed
        continue;
      }
      // other error -> rethrow
      throw err;
    }
  }
  throw new Error('Unable to create invoice (retry limit reached).');
}

// POST /api/invoices
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.date) payload.date = new Date().toISOString().slice(0,10);

    const createdInvoice = await tryCreateInvoice(payload, 6); // up to 6 attempts

    res.json({ success: true, invoice: createdInvoice, id: createdInvoice.id, invoice_no: createdInvoice.invoice_no });
  } catch (e) {
    console.error('Create invoice error:', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.getById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Not found' });
    res.json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/invoices
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const list = await Invoice.list({ from, to });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/invoices/:id (optional)
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run('DELETE FROM invoices WHERE id = ?', [id], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      // optionally delete transactions referencing the invoice_no (if you want)
      res.json({ success: true });
    });
  });
});

module.exports = router;
