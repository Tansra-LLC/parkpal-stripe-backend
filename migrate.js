const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        payed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT now()
      );
    `);

    await pool.query(`
      INSERT INTO users (email, password, payed)
      VALUES 
        ('test@example.com', 'password123', TRUE),
        ('unpaid@example.com', 'password123', FALSE)
      ON CONFLICT (email) DO NOTHING;
    `);

    console.log("✅ Table created and tester accounts added.");
  } catch (err) {
    console.error("❌ Error running migration:", err);
  } finally {
    await pool.end();
  }
})();
