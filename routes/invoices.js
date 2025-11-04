const express = require('express');
const router = express.Router();
const Invoice = require('../models/invoiceModel');
const pool = require('../models/db'); // Use pool for direct query access

// generate invoice no (date + counter)
function pad(num, size) {
  let s = "0000" + num;
  return s.substr(s.length - size);
}

function generateInvoiceNo() {
  return new Promise(async (resolve, reject) => {
    try {
      const today = new Date();
      const y = today.getFullYear();
      const m = pad(today.getMonth() + 1, 2);
      const d = pad(today.getDate(), 2);
      const prefix = `INV-${y}${m}${d}`;

      // Count today's invoices and increment
      const result = await pool.query(`SELECT COUNT(*) as c FROM invoices WHERE invoice_no LIKE $1`, [prefix + '%']);
      
      const next = (result.rows.length && result.rows[0].c ? parseInt(result.rows[0].c, 10) + 1 : 1);
      const invoiceNo = `${prefix}-${pad(next, 4)}`;
      resolve(invoiceNo);
    } catch (err) {
      reject(err);
    }
  });
}

// Try creating invoice with retry on UNIQUE constraint failure
async function tryCreateInvoice(payload, maxRetries = 5) {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts++;
    try {
      if (!payload.invoice_no) {
        payload.invoice_no = await generateInvoiceNo();
      }

      const result = await Invoice.create(payload, payload.items || []);
      const created = await Invoice.getById(result.id);

      // Create a transaction record for this invoice (income)
      const total = parseFloat(payload.total || payload.subtotal || 0);
      const nowDate = payload.date || new Date().toISOString().slice(0,10);
      
      if (!isNaN(total) && total > 0) {
        // Use direct pool query for simplicity
        const q = `INSERT INTO transactions (type, category, amount, date, reference, notes) VALUES ($1, $2, $3, $4, $5, $6)`;
        await pool.query(q, ['income', 'sales', total, nowDate, payload.invoice_no, `Invoice #${payload.invoice_no}`]);
      }

      return created; // success
    } catch (err) {
      // Check for PostgreSQL unique constraint violation (error code 23505)
      if (err.code === '23505' && err.constraint === 'invoices_invoice_no_key') {
        console.warn(`Invoice create attempt ${attempts} failed due to constraint. Regenerating invoice_no and retrying...`);
        payload.invoice_no = undefined;
        if (attempts >= maxRetries) throw new Error('Failed to generate unique invoice number after multiple attempts.');
        continue;
      }
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

    const createdInvoice = await tryCreateInvoice(payload, 6);

    res.json({ success: true, invoice: createdInvoice, id: createdInvoice.id, invoice_no: createdInvoice.invoice_no });
  } catch (e) {
    console.error('Create invoice error:', e);
    // 23502: NOT NULL violation
    const status = (e.code === '23505' || e.code === '23502') ? 400 : 500;
    res.status(status).json({ error: e.message || String(e) });
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

// DELETE /api/invoices/:id 
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    // Get the invoice number before deleting
    const invResult = await client.query('SELECT invoice_no FROM invoices WHERE id = $1', [id]);
    const invoiceNo = invResult.rows[0]?.invoice_no;

    // Delete the invoice (ON DELETE CASCADE in init.sql handles items)
    const delInvResult = await client.query('DELETE FROM invoices WHERE id = $1', [id]);
    
    if (delInvResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Invoice not found.' });
    }

    // Delete the associated transaction
    if (invoiceNo) {
        await client.query(`DELETE FROM transactions WHERE reference = $1 AND type = 'income'`, [invoiceNo]);
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Invoice deletion error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;