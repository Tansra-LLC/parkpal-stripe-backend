# Backend for ParkPal

## Setup

1. Upload this code to GitHub
2. In Render.com:
   - Create new Web Service from this GitHub repo
   - Set **Environment Variables** based on `.env.example`

## Environment Variables (Set these in Render, NOT in GitHub)
- STRIPE_SECRET_KEY: Your Stripe secret key (starts with sk_live_...)
- STRIPE_PRICE_ID: Your Stripe product's price ID
- MAPBOX_TOKEN: Your Mapbox token

## API Routes

### `POST /verify-subscription`
Checks if a Stripe customer has an active subscription.
```json
{ "customer_id": "cus_abc123" }
```

### `POST /create-checkout-session`
Creates a Stripe checkout session.
```json
{ "email": "user@example.com" }
```

### `GET /map-token`
Returns the Mapbox token.