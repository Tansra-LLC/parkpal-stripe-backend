import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Stripe from "stripe";
import jwt from "jsonwebtoken";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

// Simple in-memory user store
let users = []; // { email, password, subscriptionActive, token }

// --- AUTH ---
app.post("/signup", (req, res) => {
  const { email, password } = req.body;

  // check if user exists
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: "User already exists" });
  }

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
  const newUser = { email, password, subscriptionActive: false, token };
  users.push(newUser);

  res.json(newUser);
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json(user);
});

// --- STRIPE: PaymentIntent for in-app PaymentSheet ---
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { email } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: "User not found" });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 999, // e.g. $9.99
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Mark subscription as active after success ---
app.post("/mark-subscribed", (req, res) => {
  const { email } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.subscriptionActive = true;
  res.json(user);
});

// --- SERVER ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Backend running on ${PORT}`));
