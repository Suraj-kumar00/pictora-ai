import Stripe from "stripe";
import Razorpay from "razorpay";
import { prismaClient } from "db";
import crypto from "crypto";
import { PlanType } from "@prisma/client";

// Validate environment variables
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY");
}

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error("Missing Razorpay credentials");
}

// Initialize payment providers
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acacia",
    })
  : null;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// Define plan prices (in USD cents for Stripe, rupees for Razorpay)
export const PLAN_PRICES = {
  basic: 100, // $1 equivalent in INR (₹100)
  premium: 500, // $5 equivalent in INR (₹500)
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
  email: string
) {
  try {
    if (!stripe) {
      // For development, create a mock successful session
      if (process.env.NODE_ENV === 'development') {
        console.log("Creating mock Stripe session for development");
        const mockSessionId = `mock_sess_${Date.now()}`;
        
        await createTransactionRecord(
          userId,
          PLAN_PRICES[plan],
          "usd",
          `mock_pi_${Date.now()}`,
          mockSessionId,
          plan,
          "SUCCESS" // Auto-succeed in development
        );
        
        // Add credits in development mode
        await addCreditsForPlan(userId, plan);
        
        return {
          id: mockSessionId,
          url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?session_id=${mockSessionId}`,
        };
      }
      
      throw new Error("Stripe is not configured");
    }

    const price = PLAN_PRICES[plan];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
              description: `One-time payment for ${CREDITS_PER_PLAN[plan]} credits`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&token=${Buffer.from(JSON.stringify({timestamp: Date.now(), orderId: '{CHECKOUT_SESSION_ID}'})).toString('base64')}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel?session_id={CHECKOUT_SESSION_ID}&token=${Buffer.from(JSON.stringify({timestamp: Date.now(), orderId: '{CHECKOUT_SESSION_ID}'})).toString('base64')}`,
      customer_email: email,
      metadata: {
        userId,
        plan,
      },
    });

    await createTransactionRecord(
      userId,
      price,
      "usd",
      session.payment_intent as string,
      session.id,
      plan,
      "PENDING"
    );

    return session;
  } catch (error) {
    console.error("Stripe session creation error:", error);
    throw error;
  }
}

export async function getStripeSession(sessionId: string) {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }
  return await stripe.checkout.sessions.retrieve(sessionId);
}

export async function createRazorpayOrder(userId: string, plan: keyof typeof PLAN_PRICES) {
  try {
    console.log("Creating Razorpay order for user:", userId, "plan:", plan);
    
    const amount = PLAN_PRICES[plan];
    // Razorpay expects amount in paise (1 rupee = 100 paise)
    const amountInPaise = amount * 100;

    console.log("Amount in paise:", amountInPaise);
    
    // Validate Razorpay credentials
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay credentials missing. Check your .env file.");
    }

    // Create order data
    const orderData = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: {
        userId,
        plan,
      },
    };

    console.log("Creating order with Razorpay");
    
    // Create the order with Razorpay
    const order = await new Promise((resolve, reject) => {
      razorpay.orders.create(orderData, (err: any, result: any) => {
        if (err) {
          console.error("Razorpay order creation error:", err);
          reject(err);
        }
        console.log("Razorpay order created:", result);
        resolve(result);
      });
    });

    // Record the transaction in our database
    await createTransactionRecord(
      userId,
      amount,
      "INR",
      "",
      (order as any).id,
      plan as PlanType,
      "PENDING"
    );

    // Return the data needed by the frontend to show the Razorpay payment form
    return {
      key: process.env.RAZORPAY_KEY_ID,
      amount: amountInPaise,
      currency: "INR",
      name: "Pictora AI",
      description: `${plan.toUpperCase()} Plan - ${CREDITS_PER_PLAN[plan]} Credits`,
      order_id: (order as any).id,
      prefill: {
        name: "",
        email: "",
        contact: "",
      },
      notes: {
        userId,
        plan,
      },
      theme: {
        color: "#3399cc",
      },
    };
  } catch (error) {
    console.error("Razorpay Error:", error);
    throw error;
  }
}

export async function verifyStripePayment(sessionId: string) {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const { userId, plan } = session.metadata as {
    userId: string;
    plan: PlanType;
  };

  // Find existing pending transaction
  const existingTransaction = await prismaClient.transaction.findFirst({
    where: {
      orderId: session.id,
      userId: userId,
      status: "PENDING",
    },
  });

  if (!existingTransaction) {
    throw new Error("No pending transaction found for this session");
  }

  // Update the transaction status
  await prismaClient.transaction.update({
    where: {
      id: existingTransaction.id,
    },
    data: {
      status: session.payment_status === "paid" ? "SUCCESS" : "FAILED",
    },
  });

  return session.payment_status === "paid";
}

export const verifyRazorpaySignature = async ({
  paymentId,
  orderId,
  signature,
  userId,
  plan,
}: {
  paymentId: string;
  orderId: string;
  signature: string;
  userId: string;
  plan: PlanType;
}) => {
  try {
    if (!RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay secret key not configured");
    }

    const body = orderId + "|" + paymentId;
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    const isValid = expectedSignature === signature;
    console.log("Signature verification:", { isValid, orderId, paymentId });

    const order = await razorpay.orders.fetch(orderId);
    const amount = order.amount;
    const currency = order.currency;

    // Find existing pending transaction
    const existingTransaction = await prismaClient.transaction.findFirst({
      where: {
        orderId: orderId,
        userId: userId,
        status: "PENDING",
      },
    });

    if (!existingTransaction) {
      throw new Error("No pending transaction found for this order");
    }

    // Update the transaction status
    await prismaClient.transaction.update({
      where: {
        id: existingTransaction.id,
      },
      data: {
        paymentId,
        status: isValid ? "SUCCESS" : "FAILED",
      },
    });

    return isValid;
  } catch (error) {
    console.error("Signature verification error:", error);
    throw error;
  }
};

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
  createRazorpayOrder,
  verifyRazorpaySignature,
  getStripeSession,
  createSubscriptionRecord,
  addCreditsForPlan,
};
