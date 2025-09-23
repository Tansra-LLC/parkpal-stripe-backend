// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { Pool } = require('pg');
const Stripe = require('stripe');
const migrate = require('./migrate');  // ✅ add migrate

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Environment
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (!STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY not set (for Stripe payments)");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const stripe = Stripe(STRIPE_SECRET_KEY);

// --- Run DB migration on startup ---
migrate(pool)
  .then(() => console.log("🚀 Migration complete, users table ready"))
  .catch(err => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  });

// --- SIGNUP ---
app.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, message: "Missing email or password" });

    const pwHash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (email, password_hash, payed) VALUES ($1, $2, $3)", [email, pwHash, false]);
    return res.json({ success: true });
  } catch (err) {
    console.error("Signup error:", err);
    if (err.code === '23505') { // unique violation
      return res.json({ success: false, message: "Email already exists" });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- LOGIN ---
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, message: "Missing email or password" });

    const result = await pool.query("SELECT id, email, password_hash, payed FROM users WHERE email=$1", [email]);
    if (result.rows.length === 0) return res.json({ success: false, message: "Invalid credentials" });

    const u = result.rows[0];
    const match = await bcrypt.compare(password, u.password_hash);
    if (!match) return res.json({ success: false, message: "Invalid credentials" });

    return res.json({ success: true, payed: u.payed });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// --- SUBSCRIBE ---
app.post('/subscribe', async (req, res) => {
  try {
    const { paymentMethodId, email } = req.body || {};
    if (!paymentMethodId || !email) return res.status(400).json({ success: false, message: "Missing paymentMethodId or email" });
    if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
      return res.status(500).json({ success: false, message: "Stripe not configured on server" });
    }

    let customers = await stripe.customers.list({ email, limit: 1 });
    let customer = customers.data[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId }
      });
    } else {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id }).catch(()=>{});
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: paymentMethodId }
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: STRIPE_PRICE_ID }],
      expand: ['latest_invoice.payment_intent']
    });

    const paymentIntent = subscription.latest_invoice.payment_intent;

    if (paymentIntent && (paymentIntent.status === 'succeeded' || subscription.status === 'active')) {
      await pool.query("UPDATE users SET payed = true WHERE email = $1", [email]);
      return res.json({ success: true });
    } else {
      return res.json({ success: false, message: "Payment did not complete", details: paymentIntent && paymentIntent.status });
    }
  } catch (err) {
    console.error("Subscribe error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Health check
app.get('/', (req, res) => res.send('SpotPal auth backend'));

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
