# ParkPal Backend (Node/Express)

## Setup (local)
1. copy `.env.example` to `.env` and fill values
2. npm install
3. npm run migrate
4. npm start

## Deploy to Render
1. Create new Web Service -> Connect GitHub repo containing this backend folder.
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment variables (STRIPE_SECRET_KEY, STRIPE_PRICE_ID, JWT_SECRET, STRIPE_WEBHOOK_SECRET, SUCCESS_URL, CANCEL_URL)
5. After deploy, run `npm run migrate` once (use Render shell or run locally and push DB if desired).
6. In Stripe dashboard, create webhook endpoint pointing to `https://<YOUR_RENDER_URL>/webhook` and copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
