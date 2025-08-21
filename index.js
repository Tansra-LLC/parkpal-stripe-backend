import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-08-16" });
const JWT_SECRET = process.env.JWT_SECRET;

// DB helper
async function getDB() {
  return open({ filename: "./data.db", driver: sqlite3.Database });
}

// Signup
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  const hash = await bcrypt.hash(password, 10);
  const db = await getDB();

  try {
    const result = await db.run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [email, hash]);
    const token = jwt.sign({ id: result.lastID }, JWT_SECRET);
    res.json({ token });
  } catch {
    res.status(400).json({ error: "Email already exists" });
  }

  await db.close();
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const db = await getDB();
  const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(400).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user.id }, JWT_SECRET);
  res.json({ token, subscriptionActive: user.subscription_active === 1 });
  await db.close();
});

// Create subscription intent
app.post("/create-subscription-intent", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const decoded = jwt.verify(token, JWT_SECRET);
  const db = await getDB();
  const user = await db.get("SELECT * FROM users WHERE id = ?", [decoded.id]);

  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email });
    customerId = customer.id;
    await db.run("UPDATE users SET stripe_customer_id = ? WHERE id = ?", [customerId, user.id]);
  }

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: process.env.STRIPE_PRICE_ID }],
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"]
  });

  await db.close();
  res.json({
    clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    subscriptionId: subscription.id
  });
});

// Confirm subscription
app.post("/confirm-subscription", async (req, res) => {
  const { token } = req.body;
  const decoded = jwt.verify(token, JWT_SECRET);
  const db = await getDB();
  await db.run("UPDATE users SET subscription_active = 1 WHERE id = ?", [decoded.id]);
  await db.close();
  res.json({ success: true });
});

// Check subscription
app.get("/check-subscription", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const decoded = jwt.verify(token, JWT_SECRET);
  const db = await getDB();
  const user = await db.get("SELECT subscription_active FROM users WHERE id = ?", [decoded.id]);
  await db.close();
  res.json({ subscriptionActive: user.subscription_active === 1 });
});

// Use Render's PORT environment variable
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
