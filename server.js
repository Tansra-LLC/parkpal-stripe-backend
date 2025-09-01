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

// --- AUTH ---
app.post("/signup", (req, res) => {
  const { email, password } = req.body;
  // In production you'd hash + store securely, here we just issue a JWT
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, email });
});

app.post("/login", (req, res) => {
  const { email } = req.body;
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, email });
});

// --- STRIPE ---
app.post("/create-subscription", async (req, res) => {
  try {
    const { email, paymentMethodId } = req.body;

    // Create customer
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

    res.json(subscription);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/cancel-subscription", async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    const canceled = await stripe.subscriptions.del(subscriptionId);
    res.json(canceled);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/subscription-status/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) return res.json({ active: false });

    const subs = await stripe.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 1,
    });

    res.json({ active: subs.data.length > 0 });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- SERVER ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Backend running on ${PORT}`));
