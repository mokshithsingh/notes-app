// Creates any missing tables/indexes by running db/schema.sql.
// Usage: npm run migrate
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db.js');

async function migrate() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    try {
        await pool.query(sql);
        console.log('Database schema is up to date.');
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

migrate();
