const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const cors = require("cors");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- SIGNUP ---
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
  "INSERT INTO users (email, password, payed) VALUES ($1, $2, $3)",
  [email, hashed, false]
);
    res.json({ success: true });
  } catch (err) {
    console.error("Signup error:", err);
    res.json({ success: false });
  }
});

// --- LOGIN ---
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (result.rows.length === 0) return res.json({ success: false });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    res.json({ success: match });
  } catch (err) {
    console.error("Login error:", err);
    if (!match) return res.json({ success: false, message: "Invalid password" });
if (!user.payed) return res.json({ success: false, message: "Payment required" });

res.json({ success: true });

  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
// Add this at the very end of server.js
// (after your other routes, before module.exports if you have it)

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/subscribe", async (req, res) => {
  try {
    const { paymentMethod, email } = req.body;

    if (!paymentMethod || !email) {
      return res.status(400).json({ success: false, error: "Missing payment method or email" });
    }

    // 1. Create a customer if they don’t exist yet
    let customer = await stripe.customers.create({
      payment_method: paymentMethod.id,
      email,
      invoice_settings: { default_payment_method: paymentMethod.id },
    });

    // 2. Create a subscription to your $20/month product
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID }], // <-- your price ID from Stripe
      expand: ["latest_invoice.payment_intent"],
    });

    // 3. If payment succeeded, mark user as paid in DB
    const paymentIntent = subscription.latest_invoice.payment_intent;
    if (paymentIntent.status === "succeeded") {
      // Flip payed = true in your DB
      await pool.query("UPDATE users SET payed = true WHERE email = $1", [email]);
      return res.json({ success: true });
    } else {
      return res.json({ success: false, error: "Payment not completed" });
    }
  } catch (err) {
    console.error("Stripe subscription error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

