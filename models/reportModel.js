const pool = require('./db');

const Report = {
  summary: async ({ from, to } = {}) => {
    let incomeSql = `SELECT COALESCE(SUM(amount), 0) as total_income FROM transactions WHERE type='income'`;
    let expenseSql = `SELECT COALESCE(SUM(amount), 0) as total_expense FROM transactions WHERE type='expense'`;
    
    const dateParams = [];
    let paramIndex = 1;

    if (from && to) {
      incomeSql += ` AND date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      expenseSql += ` AND date BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      dateParams.push(from, to);
    }

    const [r1, r2] = await Promise.all([
      pool.query(incomeSql, dateParams),
      pool.query(expenseSql, dateParams)
    ]);
    
    // Convert results back to floats as PostgreSQL 'numeric' type comes back as string
    const income = parseFloat(r1.rows[0].total_income) || 0;
    const expense = parseFloat(r2.rows[0].total_expense) || 0;
    
    return { income, expense, profit: income - expense };
  }
};

module.exports = Report;