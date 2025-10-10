const express = require('express');
const router = express.Router();
const Report = require('../models/reportModel');

router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    const out = await Report.summary({ from, to });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
