require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

const app = express();

// For webhook we need raw body; but regular JSON for others
app.use(cors());
app.use(bodyParser.json());

// --- DB ---
const DB_PATH = process.env.DB_PATH || './data.db';
const db = new sqlite3.Database(DB_PATH);

// --- helpers ---
function runSql(sql, params=[]) {
  return new Promise((res, rej) => db.run(sql, params, function(err) {
    if (err) rej(err); else res(this);
  }));
}
function getSql(sql, params=[]) {
  return new Promise((res, rej) => db.get(sql, params, (err,row) => {
    if (err) rej(err); else res(row);
  }));
}

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME";
const PRICE_ID = process.env.STRIPE_PRICE_ID || "";

// --- middleware auth ---
async function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'Missing auth header' });
  const token = h.split(' ')[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// --- signup ---
app.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({error:'Missing'});
    const existing = await getSql("SELECT * FROM users WHERE email = ?", [email]);
    if (existing) return res.status(400).json({error:'Email taken'});
    const hash = await bcrypt.hash(password, 10);
    const result = await runSql("INSERT INTO users (email, password_hash) VALUES (?,?)", [email, hash]);
    const userId = result.lastID;
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- login ---
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({error:'Missing'});
    const user = await getSql("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) return res.status(400).json({error:'Invalid'});
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({error:'Invalid'});
    const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- check subscription ---
app.get('/check-subscription', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await getSql("SELECT * FROM users WHERE id = ?", [userId]);
    if (!user) return res.status(404).json({error:'User not found'});
    if (!user.stripe_customer_id) return res.json({ active: false });

    const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, expand: ['data.default_payment_method'] });
    const active = subs.data.some(s => ['active','trialing'].includes(s.status) && !s.cancel_at_period_end);
    res.json({ active });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stripe error' });
  }
});

// --- create checkout session ---
app.post('/create-checkout-session', auth, async (req, res) => {
  try {
    if (!PRICE_ID) return res.status(500).json({ error: 'PRICE_ID not configured' });
    const user = await getSql("SELECT * FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.status(404).json({error:'User not found'});

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { appUserId: user.id }});
      customerId = customer.id;
      await runSql("UPDATE users SET stripe_customer_id = ? WHERE id = ?", [customerId, user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer: customerId,
      success_url: process.env.SUCCESS_URL || 'https://example.com/success',
      cancel_url: process.env.CANCEL_URL || 'https://example.com/cancel',
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stripe error' });
  }
});

// --- webhook endpoint ---
app.post('/webhook', bodyParser.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  (async () => {
    try {
      if (event.type === 'checkout.session.completed') {
        // session completed - could log or map customer -> user
      } else if (['invoice.payment_succeeded', 'customer.subscription.updated', 'customer.subscription.created'].includes(event.type)) {
        const sub = event.data.object;
        const stripeCustomerId = sub.customer;
        // optional: update DB if you want to store subscription metadata
      }
      res.json({received: true});
    } catch (err) {
      console.error(err);
      res.status(500).end();
    }
  })();
});

// --- health ---
app.get('/', (req,res) => res.send('ParkPal backend running'));

// --- start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
