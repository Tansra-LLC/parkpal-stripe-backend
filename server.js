// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- CONFIG ---
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret"; // set in Render
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY; // set in Render
const stripe = new Stripe(STRIPE_SECRET_KEY);

// --- DATABASE (SQLite for free storage) ---
let db;
(async () => {
  db = await open({
    filename: "./users.db",
    driver: sqlite3.Database,
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      passwordHash TEXT,
      stripeCustomerId TEXT,
      subscriptionStatus TEXT
    )
  `);
})();

// --- AUTH HELPERS ---
function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.userId = user.userId;
    next();
  });
}

// --- AUTH ROUTES ---
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  const existing = await db.get("SELECT * FROM users WHERE email = ?", email);
  if (existing) return res.status(400).json({ error: "User already exists" });

  const hash = await bcrypt.hash(password, 10);
  const customer = await stripe.customers.create({ email });

  await db.run(
    "INSERT INTO users (email, passwordHash, stripeCustomerId, subscriptionStatus) VALUES (?, ?, ?, ?)",
    email,
    hash,
    customer.id,
    "inactive"
  );

  const user = await db.get("SELECT * FROM users WHERE email = ?", email);
  const token = generateToken(user.id);
  res.json({ token });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.get("SELECT * FROM users WHERE email = ?", email);
  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(400).json({ error: "Invalid credentials" });

  const token = generateToken(user.id);
  res.json({ token });
});

app.get("/me", authenticateToken, async (req, res) => {
  const user = await db.get("SELECT * FROM users WHERE id = ?", req.userId);
  res.json({ email: user.email, subscriptionStatus: user.subscriptionStatus });
});

// --- STRIPE ROUTES ---
app.post("/create-subscription", authenticateToken, async (req, res) => {
  const user = await db.get("SELECT * FROM users WHERE id = ?", req.userId);
  if (!user) return res.status(400).json({ error: "User not found" });

  try {
    const priceId = process.env.STRIPE_PRICE_ID; // set in Render
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: user.stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: "yourapp://success",
      cancel_url: "yourapp://cancel",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Webhook to update subscription status
app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed.", err.message);
    return res.sendStatus(400);
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object;
    const customerId = subscription.customer;
    const status = subscription.status;

    await db.run("UPDATE users SET subscriptionStatus = ? WHERE stripeCustomerId = ?", status, customerId);
  }

  res.json({ received: true });
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
