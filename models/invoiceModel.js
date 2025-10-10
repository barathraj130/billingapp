const db = require('./db');

const Invoice = {
  create: (invoice, items) => new Promise((resolve, reject) => {
    const { invoice_no, customer_id = null, date, subtotal, tax, total, notes } = invoice;
    const q = `INSERT INTO invoices (invoice_no, customer_id, date, subtotal, tax, total, notes)
               VALUES (?,?,?,?,?,?,?)`;
    db.run(q, [invoice_no, customer_id, date, subtotal, tax, total, notes], function (err) {
      if (err) return reject(err);
      const invoiceId = this.lastID;
      if (!items || items.length === 0) return resolve({ id: invoiceId });

      const stmt = db.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, unit_price, line_total) VALUES (?,?,?,?,?)`);
      for (const it of items) {
        stmt.run(invoiceId, it.description, it.qty, it.unit_price, it.line_total);
      }
      stmt.finalize((e) => {
        if (e) return reject(e);
        resolve({ id: invoiceId });
      });
    });
  }),

  getById: (id) => new Promise((resolve, reject) => {
    db.get(`SELECT * FROM invoices WHERE id = ?`, [id], (err, invoice) => {
      if (err) return reject(err);
      if (!invoice) return resolve(null);
      db.all(`SELECT * FROM invoice_items WHERE invoice_id = ?`, [id], (e, items) => {
        if (e) return reject(e);
        invoice.items = items;
        resolve(invoice);
      });
    });
  }),

  list: ({ from, to } = {}) => new Promise((resolve, reject) => {
    let sql = `SELECT * FROM invoices`;
    const params = [];
    if (from && to) {
      sql += ` WHERE date BETWEEN ? AND ?`;
      params.push(from, to);
    }
    sql += ` ORDER BY date DESC`;
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  })
};

module.exports = Invoice;
