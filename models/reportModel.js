const db = require('./db');

const Report = {
  summary: ({ from, to } = {}) => new Promise((resolve, reject) => {
    // Use parameterized queries for safety
    let incomeSql = `SELECT IFNULL(SUM(amount),0) as total_income FROM transactions WHERE type='income'`;
    let expenseSql = `SELECT IFNULL(SUM(amount),0) as total_expense FROM transactions WHERE type='expense'`;
    const params = [];

    if (from && to) {
      incomeSql += ` AND date BETWEEN ? AND ?`;
      expenseSql += ` AND date BETWEEN ? AND ?`;
      params.push(from, to, from, to);
      // We'll run queries separately with different param slices
      db.get(incomeSql, [from, to], (e1, r1) => {
        if (e1) return reject(e1);
        db.get(expenseSql, [from, to], (e2, r2) => {
          if (e2) return reject(e2);
          const income = r1.total_income || 0;
          const expense = r2.total_expense || 0;
          resolve({ income, expense, profit: income - expense });
        });
      });
    } else {
      db.get(incomeSql, [], (e1, r1) => {
        if (e1) return reject(e1);
        db.get(expenseSql, [], (e2, r2) => {
          if (e2) return reject(e2);
          const income = r1.total_income || 0;
          const expense = r2.total_expense || 0;
          resolve({ income, expense, profit: income - expense });
        });
      });
    }
  })
};

module.exports = Report;
