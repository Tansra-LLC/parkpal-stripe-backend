import sqlite3 from "sqlite3";
import { open } from "sqlite";

async function main() {
  const db = await open({ filename: "./data.db", driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      stripe_customer_id TEXT,
      subscription_active INTEGER DEFAULT 0
    );
  `);

  console.log("Database migrated");
  await db.close();
}

main();
