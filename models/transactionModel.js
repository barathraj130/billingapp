const db = require('./db');

const Transaction = {
  create: ({ type, category, amount, date, reference, notes }) => new Promise((resolve, reject) => {
    const q = `INSERT INTO transactions (type, category, amount, date, reference, notes) VALUES (?,?,?,?,?,?)`;
    db.run(q, [type, category, amount, date, reference, notes], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID });
    });
  }),

  list: ({ from, to, type } = {}) => new Promise((resolve, reject) => {
    let sql = `SELECT * FROM transactions WHERE 1=1`;
    const params = [];
    if (type) {
      sql += ` AND type = ?`;
      params.push(type);
    }
    if (from && to) {
      sql += ` AND date BETWEEN ? AND ?`;
      params.push(from, to);
    }
    sql += ` ORDER BY date DESC`;
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  })
};

module.exports = Transaction;
