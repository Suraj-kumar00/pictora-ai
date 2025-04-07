import Stripe from "stripe";

// Initialize Stripe only if API key is available
let stripe: Stripe | null = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    });
  }
} catch (error) {
  console.error("Failed to initialize Stripe:", error);
}

export { stripe }; 