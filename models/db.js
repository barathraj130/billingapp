// models/db.js (PostgreSQL)
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Render/standard practice uses DATABASE_URL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("FATAL: DATABASE_URL environment variable is not set. Cannot connect to PostgreSQL.");
  // Note: For a Render setup, this check is vital.
  // process.exit(1); 
}

const pool = new Pool({
  connectionString: connectionString,
  // Required for Render/external databases using SSL
  ssl: {
    rejectUnauthorized: false 
  }
});

const INIT_SQL_FILE = path.join(__dirname, '..', 'database', 'init.sql');

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database successfully.');
});

// Function to initialize the schema (Create tables)
async function initializeSchema() {
  try {
    const sql = fs.readFileSync(INIT_SQL_FILE, 'utf8');
    const client = await pool.connect();
    // Execute the full initialization script (assumes it uses PG compatible DDL)
    await client.query(sql); 
    client.release();
    console.log('Database schema ensured from init.sql (PostgreSQL).');
  } catch (e) {
    console.error('Error running init.sql (ensure it is PostgreSQL compatible):', e);
  }
}

// Check connection and initialize schema immediately upon startup
initializeSchema();

module.exports = pool;