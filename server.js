import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

// --- SQLite Setup ---
const db = new sqlite3.Database("./users.db");
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password TEXT, payedFor INTEGER DEFAULT 0)"
  );
});

// --- AUTH ---
app.post("/signup", (req, res) => {
  const { email, password } = req.body;
  const hashed = bcrypt.hashSync(password, 10);

  db.run(
    "INSERT INTO users (email, password, payedFor) VALUES (?, ?, 0)",
    [email, hashed],
    function (err) {
      if (err) {
        return res.status(400).json({ error: "User already exists" });
      }
      const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, email, payedFor: false });
    }
  );
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
    if (err || !row) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    if (!bcrypt.compareSync(password, row.password)) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, email, payedFor: !!row.payedFor });
  });
});

// --- STRIPE ---
app.post("/create-subscription", async (req, res) => {
  try {
    const { email, paymentMethodId } = req.body;

    const customer = await stripe.customers.create({
      email,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      expand: ["latest_invoice.payment_intent"],
    });

    // update DB: mark user as payed
    db.run("UPDATE users SET payedFor = 1 WHERE email = ?", [email]);

    res.json(subscription);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Subscription status ---
app.get("/subscription-status/:email", (req, res) => {
  const { email } = req.params;

  db.get("SELECT payedFor FROM users WHERE email = ?", [email], (err, row) => {
    if (err || !row) return res.json({ active: false });
    res.json({ active: !!row.payedFor });
  });
});

// --- SERVER ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Backend running on ${PORT}`));

