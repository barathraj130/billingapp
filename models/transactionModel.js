const pool = require('./db');

const Transaction = {
  create: async ({ type, category, amount, date, reference, notes }) => {
    const q = `INSERT INTO transactions (type, category, amount, date, reference, notes) 
               VALUES ($1, $2, $3, $4, $5, $6) 
               RETURNING id`;
    const result = await pool.query(q, [type, category, amount, date, reference, notes]);
    return { id: result.rows[0].id };
  },

  list: async ({ from, to, type } = {}) => {
    let sql = `SELECT * FROM transactions WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (type) {
      sql += ` AND type = $${paramIndex++}`;
      params.push(type);
    }
    if (from && to) {
      sql += ` AND date BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(from, to);
    }
    
    sql += ` ORDER BY date DESC, id DESC`;
    
    const result = await pool.query(sql, params);
    return result.rows;
  }
};

module.exports = Transaction;