import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || "default_secret";

// In-memory "users" for demo (replace with DB in production)
let users = [];

// --- AUTH ---
app.post("/signup", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({ success: false, message: "Email and password required" });
  }

  if (users.find((u) => u.email === email)) {
    return res.json({ success: false, message: "User already exists" });
  }

  const newUser = {
    id: uuidv4(),
    email,
    password, // ⚠️ In production, hash this!
    subscriptionActive: false
  };

  users.push(newUser);

  const token = jwt.sign({ id: newUser.id, email }, JWT_SECRET, { expiresIn: "7d" });

  res.json({
    success: true,
    message: "Signup successful",
    user: {
      id: newUser.id,
      email: newUser.email,
      subscriptionActive: newUser.subscriptionActive
    },
    token
  });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.find((u) => u.email === email);

  if (!user || user.password !== password) {
    return res.json({ success: false, message: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: "7d" });

  res.json({
    success: true,
    message: "Login successful",
    user: {
      id: user.id,
      email: user.email,
      subscriptionActive: user.subscriptionActive
    },
    token
  });
});

// --- STRIPE: create subscription ---
app.post("/create-subscription", async (req, res) => {
  try {
    const { email, paymentMethodId } = req.body;
    const user = users.find((u) => u.email === email);
    if (!user) return res.json({ success: false, message: "User not found" });

    // Create customer in Stripe
    const customer = await stripe.customers.create({
      email,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      expand: ["latest_invoice.payment_intent"],
    });

    // Update in-memory record
    user.subscriptionActive = true;

    res.json({
      success: true,
      message: "Subscription created",
      subscriptionId: subscription.id,
      user: {
        id: user.id,
        email: user.email,
        subscriptionActive: user.subscriptionActive
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// --- Cancel subscription ---
app.post("/cancel-subscription", async (req, res) => {
  try {
    const { subscriptionId, email } = req.body;
    const user = users.find((u) => u.email === email);
    if (!user) return res.json({ success: false, message: "User not found" });

    await stripe.subscriptions.del(subscriptionId);
    user.subscriptionActive = false;

    res.json({
      success: true,
      message: "Subscription cancelled",
      user: {
        id: user.id,
        email: user.email,
        subscriptionActive: user.subscriptionActive
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// --- Subscription status ---
app.get("/subscription-status/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const user = users.find((u) => u.email === email);
    if (!user) return res.json({ success: false, active: false });

    res.json({
      success: true,
      active: user.subscriptionActive
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// --- SERVER ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Backend running on ${PORT}`));
