// server.js
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // pure-JS bcrypt (no native build)
const { Pool } = require('pg');
const Stripe = require('stripe');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Environment / config ---
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Set this in Render environment variables.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

// --- Migration (runs at startup) ---
async function migrate() {
  try {
    // create table if missing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        payed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);

    // insert test users (one paid, one unpaid) - won't duplicate because of ON CONFLICT
    const pw1 = bcrypt.hashSync('password123', 10);
    const pw2 = bcrypt.hashSync('password123', 10);

    await pool.query(
      `INSERT INTO users (email, password_hash, payed)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING;`,
      ['test@example.com', pw1, true]
    );

    await pool.query(
      `INSERT INTO users (email, password_hash, payed)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING;`,
      ['unpaid@example.com', pw2, false]
    );

    console.log('✅ Migration complete (users table ready and test users inserted).');
  } catch (err) {
    console.error('❌ Migration error:', err);
    throw err;
  }
}

// Run migration then start server
(async () => {
  try {
    await migrate();
  } catch (err) {
    console.error('Migration failed, exiting.', err);
    process.exit(1);
  }

  // --- ROUTES ---


  // Health
  app.get('/', (req, res) => res.send('SpotPal backend'));

  // SIGNUP: { email, password }
  app.post('/signup', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ success: false, message: 'Missing email or password' });

      const pwHash = await bcrypt.hash(password, 10);
      await pool.query('INSERT INTO users (email, password_hash, payed) VALUES ($1, $2, $3)', [email, pwHash, false]);

      return res.json({ success: true });
    } catch (err) {
      console.error('Signup error:', err);
      if (err.code === '23505') { // unique_violation
        return res.json({ success: false, message: 'Email already exists' });
      }
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // LOGIN: { email, password } -> returns { success: Bool, payed: Bool }
  app.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ success: false, message: 'Missing email or password' });

      const result = await pool.query('SELECT id, email, password_hash, payed FROM users WHERE email = $1', [email]);
      if (result.rows.length === 0) return res.json({ success: false, message: 'Invalid credentials' });

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.json({ success: false, message: 'Invalid credentials' });

      return res.json({ success: true, payed: user.payed });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  });

  // SUBSCRIBE: { paymentMethodId, email }
  // Creates/attaches payment method, creates subscription to STRIPE_PRICE_ID,
  // and sets users.payed = true if payment completes.
  app.post('/subscribe', async (req, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ success: false, message: 'Stripe not configured on server' });
      }
      const { paymentMethodId, email } = req.body || {};
      if (!paymentMethodId || !email) return res.status(400).json({ success: false, message: 'Missing paymentMethodId or email' });
      if (!STRIPE_PRICE_ID) return res.status(500).json({ success: false, message: 'STRIPE_PRICE_ID not set' });

      // find or create customer
      let customer = null;
      const list = await stripe.customers.list({ email, limit: 1 });
      if (list && list.data && list.data.length > 0) {
        customer = list.data[0];
      }

      if (!customer) {
        customer = await stripe.customers.create({
          email,
          payment_method: paymentMethodId,
          invoice_settings: { default_payment_method: paymentMethodId }
        });
      } else {
        // attach payment method if needed and set default
        try {
          await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
        } catch (e) {
          // ignore already-attached errors
        }
        await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: paymentMethodId } });
      }

      // create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: STRIPE_PRICE_ID }],
        expand: ['latest_invoice.payment_intent']
      });

      const paymentIntent = subscription.latest_invoice && subscription.latest_invoice.payment_intent;

      // treat "active" subscription or a succeeded payment intent as successful
      if (subscription.status === 'active' || (paymentIntent && paymentIntent.status === 'succeeded')) {
        // update DB: mark user as paid
        await pool.query('UPDATE users SET payed = true WHERE email = $1', [email]);
        return res.json({ success: true });
      } else {
        return res.json({ success: false, message: 'Payment did not complete', details: paymentIntent && paymentIntent.status });
      }
    } catch (err) {
      console.error('Subscribe error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Subscription failed' });
    }
  });

  // Start listening
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
})();

