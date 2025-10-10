const db = require('../models/db');

function pad(num, size) {
  let s = "000000" + num;
  return s.substr(s.length - size);
}

function generateInvoiceNo() {
  return new Promise((resolve, reject) => {
    const today = new Date();
    const y = today.getFullYear();
    const m = pad(today.getMonth() + 1, 2);
    const d = pad(today.getDate(), 2);
    const prefix = `INV-${y}${m}${d}`;

    // count today's invoices and increment
    db.get(`SELECT COUNT(*) as c FROM invoices WHERE invoice_no LIKE ?`, [prefix + '%'], (err, row) => {
      if (err) return reject(err);
      const next = (row && row.c ? row.c + 1 : 1);
      const invoiceNo = `${prefix}-${pad(next, 4)}`;
      resolve(invoiceNo);
    });
  });
}

module.exports = { generateInvoiceNo };
