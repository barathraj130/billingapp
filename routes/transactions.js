const express = require('express');
const router = express.Router();
const Transaction = require('../models/transactionModel');

// create transaction (income/expense)
router.post('/', async (req, res) => {
  try {
    const { type, category, amount, date, reference, notes } = req.body;
    if (!type || !['income','expense'].includes(type)) return res.status(400).json({ error: 'type must be income or expense' });
    if (!amount || isNaN(amount)) return res.status(400).json({ error: 'amount required' });
    const payload = { type, category, amount: parseFloat(amount), date: date || new Date().toISOString().slice(0,10), reference, notes };
    const r = await Transaction.create(payload);
    res.json({ success: true, id: r.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// list transactions
router.get('/', async (req, res) => {
  try {
    const { from, to, type } = req.query;
    const rows = await Transaction.list({ from, to, type });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
