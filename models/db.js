// SQLite connection and initialization
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'billing.db');
const INIT_SQL_FILE = path.join(__dirname, '..', 'database', 'init.sql');

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Failed to open DB', err);
    process.exit(1);
  } else {
    console.log('Opened SQLite DB:', DB_FILE);
    // initialize schema if init.sql exists
    try {
      const sql = fs.readFileSync(INIT_SQL_FILE, 'utf8');
      db.exec(sql, (e) => {
        if (e) console.error('Error running init.sql', e);
        else console.log('Database schema ensured from init.sql');
      });
    } catch (e) {
      console.warn('init.sql not found or error reading it:', e.message);
    }
  }
});

module.exports = db;
