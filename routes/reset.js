// routes/reset.js (PostgreSQL)
const express = require('express');
const router = express.Router();
const pool = require('../models/db'); 

// POST /api/reset
router.post('/', async (req, res) => {
  let client;
  try {
    const { confirm, secret } = req.body || {};

    if (confirm !== 'RESET') {
      return res.status(400).json({ error: "You must provide confirm: 'RESET' to proceed." });
    }

    const REQUIRED_SECRET = process.env.RESET_SECRET;
    if (REQUIRED_SECRET && REQUIRED_SECRET.length > 0) {
      if (!secret || secret !== REQUIRED_SECRET) {
        return res.status(403).json({ error: 'Missing or invalid reset secret.' });
      }
    }

    client = await pool.connect();
    
    // Find all non-system tables
    const tableResult = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'pg_%' AND tablename NOT LIKE 'sql_%'`
    );
    
    const tables = tableResult.rows.map(r => r.tablename);

    if (tables.length === 0) {
        return res.json({ success: true, message: 'No tables found to reset.' });
    }

    // Use TRUNCATE ... RESTART IDENTITY CASCADE to clear data, reset serial IDs, and handle foreign keys
    const truncateQueries = tables.map(t => 
      `TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`
    );

    await client.query('BEGIN');
    await client.query(truncateQueries.join('; '));
    await client.query('COMMIT');

    console.log(`Successfully reset and truncated tables: ${tables.join(', ')}`);
    return res.json({ success: true, message: `Database reset completed. Tables cleared: ${tables.length}` });

  } catch (err) {
    if (client) {
        try { await client.query('ROLLBACK'); } catch (e) { /* silent fail rollback */ }
    }
    console.error('Reset failed:', err);
    return res.status(500).json({ error: String(err.detail || err.message || err) });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;