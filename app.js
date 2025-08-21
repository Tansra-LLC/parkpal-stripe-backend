import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Health check
app.get("/", (_req, res) => res.json({ ok: true }));

/**
 * POST /checkout/init
 * Body: { email: string }
 *
 * Creates/gets a Customer, makes a Subscription (incomplete),
 * returns everything iOS PaymentSheet needs:
 *  - publishableKey (safe to expose)
 *  - customerId
 *  - ephemeralKeySecret
 *  - paymentIntentClientSecret
 */
app.post("/checkout/init", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    // Create or reuse customer by email
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0] || (await stripe.customers.create({ email }));

    // Create an ephemeral key for PaymentSheet customer configuration
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customer.id },
      { apiVersion: "2024-06-20" } // keep in sync with Stripe version
    );

    // Create the subscription in "incomplete" state, so the first invoice requires payment
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID }], // set in Render env
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"]
    });

    const paymentIntent = subscription.latest_invoice.payment_intent;

    return res.json({
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY, // add this in Render
      customerId: customer.id,
      ephemeralKeySecret: ephemeralKey.secret,
      paymentIntentClientSecret: paymentIntent.client_secret,
      subscriptionId: subscription.id
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to initialize checkout" });
  }
});

/**
 * GET /subscription/status?email=...
 * Returns { active: boolean }
 */
app.get("/subscription/status", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "email is required" });

    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0];
    if (!customer) return res.json({ active: false });

    // Find any active subscription for this customer
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 1
    });

    return res.json({ active: subs.data.length > 0 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to check status" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SpotPal Stripe backend running on :${port}`));
