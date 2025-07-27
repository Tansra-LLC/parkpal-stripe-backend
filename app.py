from flask import Flask, request, jsonify
import os
import stripe
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Initialize Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")  # <- Replace in Render, not in GitHub

@app.route("/verify-subscription", methods=["POST"])
def verify_subscription():
    data = request.get_json()
    customer_id = data.get("customer_id")

    try:
        subscriptions = stripe.Subscription.list(customer=customer_id, status="active")
        is_active = len(subscriptions.data) > 0
        return jsonify({"active": is_active})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/create-checkout-session", methods=["POST"])
def create_checkout_session():
    data = request.get_json()
    customer_email = data.get("email")  # You can store/retrieve Stripe customer from email

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[
                {
                    "price": os.getenv("STRIPE_PRICE_ID"),  # <- Replace in Render
                    "quantity": 1
                }
            ],
            customer_email=customer_email,
            success_url="https://your-app.com/success",  # <- Replace with your app's success URL
            cancel_url="https://your-app.com/cancel"     # <- Replace with your app's cancel URL
        )
        return jsonify({"checkout_url": session.url})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/map-token", methods=["GET"])
def map_token():
    return jsonify({"token": os.getenv("MAPBOX_TOKEN")})  # <- Replace in Render

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)