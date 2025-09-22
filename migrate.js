// migrate.js
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.argv[2];
if (!connectionString) {
  console.error("Provide DATABASE_URL as env var or as first arg.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        payed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);

    await pool.query(`
      INSERT INTO users (email, password_hash, payed)
      VALUES
        ('tester@apple.com', '${require('bcryptjs').hashSync('P@$$word123', 10)}', TRUE),
        ('unpaid@example.com', '${require('bcryptjs').hashSync('password123', 10)}', FALSE)
      ON CONFLICT (email) DO NOTHING;
    `);

    console.log("✅ Migration finished: users table ready and test accounts added.");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await pool.end();
  }
})();

