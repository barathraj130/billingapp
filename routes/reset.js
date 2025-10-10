// routes/reset.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const child_process = require('child_process');

const DB_PATH = path.resolve(__dirname, '..', 'billing.db'); // adjust if your DB path differs

// POST /api/reset
// body: { confirm: "RESET", secret?: "..." }
router.post('/', async (req, res) => {
  try {
    const { confirm, secret } = req.body || {};

    // require explicit confirmation string
    if (confirm !== 'RESET') {
      return res.status(400).json({ error: "You must provide confirm: 'RESET' to proceed." });
    }

    // optional server-side secret: if set, require it
    const REQUIRED_SECRET = process.env.RESET_SECRET;
    if (REQUIRED_SECRET && REQUIRED_SECRET.length > 0) {
      if (!secret || secret !== REQUIRED_SECRET) {
        return res.status(403).json({ error: 'Missing or invalid reset secret.' });
      }
    }

    // make a backup copy of DB (if exists)
    let backupPath = null;
    if (fs.existsSync(DB_PATH)) {
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      backupPath = DB_PATH + `.bak.${ts}`;
      fs.copyFileSync(DB_PATH, backupPath);
      console.log('DB backup created at', backupPath);
    } else {
      console.log('No DB file found at', DB_PATH, '- proceeding to create empty DB after reset.');
    }

    // connect to DB (if doesn't exist, this will create a new empty file)
    const db = new sqlite3.Database(DB_PATH);

    // delete all rows from user tables (list discovered dynamically)
    db.serialize(() => {
      db.run('PRAGMA foreign_keys = OFF;');

      db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", (err, rows) => {
        if (err) {
          db.close();
          return res.status(500).json({ error: 'Failed to read tables: ' + err.message });
        }

        const tables = (rows || []).map(r => r.name).filter(n => n); // table names
        db.run('BEGIN TRANSACTION');
        tables.forEach((t) => {
          // delete rows
          db.run(`DELETE FROM "${t}"`, (delErr) => {
            if (delErr) console.warn('delete error for', t, delErr.message);
          });
          // reset autoincrement sequence if any
          db.run(`DELETE FROM sqlite_sequence WHERE name = ?`, [t], (seqErr) => {
            if (seqErr) console.warn('seq reset error for', t, seqErr.message);
          });
        });
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            db.close();
            return res.status(500).json({ error: 'Commit failed: ' + commitErr.message });
          }

          db.close((closeErr) => {
            if (closeErr) console.warn('DB close error:', closeErr);

            // vacuum the DB to reclaim space (best-effort)
            try {
              // try shell command vacuum (requires sqlite3 CLI present)
              child_process.execSync(`sqlite3 "${DB_PATH}" "VACUUM;"`, { stdio: 'ignore' });
            } catch (e) {
              // fallback: open DB and run VACUUM via sqlite3 lib if CLI not present
              try {
                const db2 = new sqlite3.Database(DB_PATH);
                db2.serialize(() => {
                  db2.run('VACUUM;', () => db2.close());
                });
              } catch (e2) {
                console.warn('VACUUM failed:', e.message || e2.message);
              }
            }

            return res.json({ success: true, backup: backupPath });
          });
        });
      });
    });

  } catch (err) {
    console.error('Reset failed:', err);
    return res.status(500).json({ error: String(err) });
  }
});

module.exports = router;
