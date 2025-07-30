const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
require('dotenv').config();

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.use(cors());
app.use(bodyParser.json());

let activeSubscriptions = {}; // In-memory storage for demo

app.post('/create-subscription', async (req, res) => {
    const { email } = req.body;
    try {
        const customer = await stripe.customers.create({ email });
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: process.env.STRIPE_PRICE_ID }],
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent'],
        });

        res.json({
            clientSecret: subscription.latest_invoice.payment_intent.client_secret,
            customerId: customer.id,
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (request, response) => {
    const sig = request.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
    } catch (err) {
        return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const isActive = subscription.status === 'active';
        activeSubscriptions[customerId] = isActive;
    }

    if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        activeSubscriptions[customerId] = false;
    }

    response.json({ received: true });
});

app.get('/api/check-subscription', (req, res) => {
    const customerId = req.query.customerId;
    const active = activeSubscriptions[customerId] || false;
    res.json({ active });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));