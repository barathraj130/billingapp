const pool = require('./db');

const Invoice = {
  create: async (invoice, items) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { invoice_no, customer_id = null, date, subtotal, tax, total, notes, customer_name = null } = invoice;
      
      // PostgreSQL returns the ID via RETURNING clause
      const q = `INSERT INTO invoices (invoice_no, customer_id, date, subtotal, tax, total, notes, customer_name)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING id`;
      
      const result = await client.query(q, [invoice_no, customer_id, date, subtotal, tax, total, notes, customer_name]);
      const invoiceId = result.rows[0].id;
      
      if (items && items.length > 0) {
        const itemQueries = items.map(it => {
          const itemQ = `INSERT INTO invoice_items (invoice_id, description, qty, unit_price, line_total) 
                         VALUES ($1, $2, $3, $4, $5)`;
          return client.query(itemQ, [invoiceId, it.description, it.qty, it.unit_price, it.line_total]);
        });
        await Promise.all(itemQueries);
      }

      await client.query('COMMIT');
      return { id: invoiceId };

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  getById: async (id) => {
    const client = await pool.connect();
    try {
      const invoiceResult = await client.query(`SELECT * FROM invoices WHERE id = $1`, [id]);
      const invoice = invoiceResult.rows[0];
      
      if (!invoice) return null;
      
      const itemsResult = await client.query(`SELECT * FROM invoice_items WHERE invoice_id = $1`, [id]);
      invoice.items = itemsResult.rows;
      
      return invoice;
    } finally {
      client.release();
    }
  },

  list: async ({ from, to } = {}) => {
    const client = await pool.connect();
    try {
      let sql = `SELECT * FROM invoices`;
      const params = [];
      let whereClauses = [];
      let paramIndex = 1;

      if (from && to) {
        whereClauses.push(`date BETWEEN $${paramIndex++} AND $${paramIndex++}`);
        params.push(from, to);
      }
      
      if (whereClauses.length) {
        sql += ` WHERE ` + whereClauses.join(' AND ');
      }
      
      sql += ` ORDER BY id DESC`; 
      
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
};

module.exports = Invoice;