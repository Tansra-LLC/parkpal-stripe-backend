const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Render will inject this
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
