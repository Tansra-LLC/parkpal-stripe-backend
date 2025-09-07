import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

// ---- In-memory users ----
let users = []; 
// { email, password, payedFor: false/true }

// ---- AUTH ----
app.post("/signup", (req, res) => {
  const { email, password } = req.body;

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: "User already exists" });
  }

  const newUser = { email, password, payedFor: false };
  users.push(newUser);

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, email, payedFor: false });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, email, payedFor: user.payedFor });
});

// ---- STRIPE ----
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { email } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 999, // $9.99
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      receipt_email: email,
    });

    res.send({
      paymentIntent: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(400).json({ error: error.message });
  }
});

// After successful payment, mark user as payed
app.post("/mark-payed", (req, res) => {
  const { email } = req.body;

  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: "User not found" });

  user.payedFor = true;
  res.json({ success: true, email, payedFor: true });
});

// ---- SERVER ----
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
