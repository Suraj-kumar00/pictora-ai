import Stripe from "stripe";
import { prismaClient } from "db";
import crypto from "crypto";
import { PlanType } from "@prisma/client";

// Validate environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY");
}

// Initialize payment providers
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    })
  : null;

// Define plan prices (in rupees)
export const PLAN_PRICES = {
  basic: 4000, 
  premium: 8000, 
} as const;

// Define credit amounts per plan
export const CREDITS_PER_PLAN = {
  basic: 500,
  premium: 1000,
} as const;

export async function createTransactionRecord(
  userId: string,
  amount: number,
  currency: string,
  paymentId: string,
  orderId: string,
  plan: PlanType,
  status: "PENDING" | "SUCCESS" | "FAILED" = "PENDING"
) {
  try {
    return await withRetry(() =>
      prismaClient.transaction.create({
        data: {
          userId,
          amount,
          currency,
          paymentId,
          orderId,
          plan,
          status,
          
        },
      })
    );
  } catch (error) {
    console.error("Transaction creation error:", error);
    throw error;
  }
}

export async function createStripeSession(
  userId: string,
  plan: "basic" | "premium",
  userEmail: string
): Promise<{ id: string; url: string | null }> {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY in your environment variables."
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: plan === "basic" ? "Basic Plan" : "Premium Plan",
              description: `One-time payment for ${plan === "basic" ? "Basic" : "Premium"} plan`,
            },
            unit_amount: PLAN_PRICES[plan] * 100, // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      metadata: {
        userId,
        plan,
      },
      customer_email: userEmail,
    });

    return {
      id: session.id,
      url: session.url,
    };
  } catch (error) {
    console.error("Stripe session creation error:", error);
    throw new Error(
      `Failed to create payment session: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

export async function getStripeSession(sessionId: string) {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY in your environment variables."
    );
  }
  return await stripe.checkout.sessions.retrieve(sessionId);
}

export async function verifyStripePayment(sessionId: string) {
  if (!stripe) {
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY in your environment variables."
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === "paid") {
      return {
        success: true,
        paymentId: session.payment_intent,
        amount: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
      };
    }

    return {
      success: false,
      error: "Payment not completed",
    };
  } catch (error) {
    console.error("Stripe payment verification error:", error);
    throw error;
  }
}

// Add retry logic for database operations
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      retries > 0 &&
      error instanceof Error &&
      error.message.includes("Can't reach database server")
    ) {
      console.log(`Retrying operation, ${retries} attempts left`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function addCreditsForPlan(userId: string, plan: PlanType) {
  try {
    const credits = CREDITS_PER_PLAN[plan];
    console.log("Adding credits:", { userId, plan, credits });

    return await withRetry(() =>
      prismaClient.userCredit.upsert({
        where: { userId },
        update: { amount: { increment: credits } },
        create: {
          userId,
          amount: credits,
        },
      })
    );
  } catch (error) {
    console.error("Credit addition error:", error);
    throw error;
  }
}

export async function createSubscriptionRecord(
  userId: string,
  plan: PlanType,
  paymentId: string,
  orderId: string,
  isAnnual: boolean = false
) {
  try {
    return await withRetry(() =>
      prismaClient.$transaction(async (prisma) => {
        console.log("Creating subscription:", {
          userId,
          plan,
          paymentId,
          orderId,
          isAnnual,
        });

        const subscription = await prisma.subscription.create({
          data: {
            userId,
            plan,
            paymentId,
            orderId,
          },
        });

        await addCreditsForPlan(userId, plan);
        return subscription;
      })
    );
  } catch (error) {
    console.error("Subscription creation error:", error);
    throw error;
  }
}

export const PaymentService = {
  createStripeSession,
  getStripeSession,
  verifyStripePayment,
  createSubscriptionRecord,
  addCreditsForPlan,
};
