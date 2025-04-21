import express from "express";
import { authMiddleware } from "../middleware";
import { PlanType } from "@prisma/client";
import { prismaClient } from "db";
import Stripe from "stripe";
import { PaymentService } from "../services/payment";

const router = express.Router();

// Initialize Stripe if API key is available
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acacia",
    })
  : null;

// Generic payment creation endpoint
router.post(
  "/create",
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    try {
      const { plan, method } = req.body;
      const userId = req.userId!;

      console.log("Payment request received:", {
        userId,
        plan,
        method
      });

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      if (!plan || !method) {
        res.status(400).json({ message: "Missing required fields" });
        return;
      }

      if (method === "razorpay") {
        const order = await PaymentService.createRazorpayOrder(userId, plan);
        res.json(order);
        return;
      } 
      
      // Stripe is currently not fully supported
      if (method === "stripe") {
        res.status(400).json({ message: "Stripe payments currently not supported" });
        return;
      } 
      
      res.status(400).json({ message: "Invalid payment method" });
    } catch (error) {
      console.error("Payment creation error:", error);
      res.status(500).json({
        message: "Error creating payment session",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Razorpay order creation endpoint
router.post('/razorpay/order', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.userId!;
    
    console.log("Creating Razorpay order:", { userId, plan });
    
    // Development logging
    console.log("Razorpay credentials available:", {
      keyAvailable: !!process.env.RAZORPAY_KEY_ID,
      secretAvailable: !!process.env.RAZORPAY_KEY_SECRET
    });

    const order = await PaymentService.createRazorpayOrder(userId, plan);
    
    console.log("Razorpay order created:", order);
    res.json(order);
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ 
      error: 'Failed to create payment order', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Razorpay payment verification endpoint
router.post('/razorpay/verify', authMiddleware, async (req, res) => {
  try {
    // Extract data from request
    const { 
      razorpay_payment_id, 
      razorpay_order_id, 
      razorpay_signature, 
      plan 
    } = req.body;
    
    const userId = req.userId!;
    
    console.log("Verifying Razorpay payment:", { 
      userId, 
      orderId: razorpay_order_id, 
      paymentId: razorpay_payment_id 
    });
    
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !plan) {
      res.status(400).json({
        message: "Missing required fields",
        received: { razorpay_payment_id, razorpay_order_id, razorpay_signature, plan }
      });
      return;
    }
    
    // Verify the signature
    const isValid = await PaymentService.verifyRazorpaySignature({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      signature: razorpay_signature,
      userId,
      plan: plan as PlanType,
    });
    
    if (!isValid) {
      res.status(400).json({ success: false, message: 'Invalid payment signature' });
      return;
    }
    
    // Create subscription record and add credits
    const subscription = await PaymentService.createSubscriptionRecord(
      userId,
      plan as PlanType,
      razorpay_payment_id,
      razorpay_order_id
    );
    
    // Get updated credits
    const userCredit = await prismaClient.userCredit.findUnique({
      where: { userId },
      select: { amount: true },
    });
    
    console.log("Payment successful:", {
      subscription,
      credits: userCredit?.amount || 0,
    });
    
    res.json({ 
      success: true, 
      message: 'Payment verified successfully',
      credits: userCredit?.amount || 0
    });
  } catch (error) {
    console.error("Error verifying Razorpay payment:", error);
    res.status(500).json({ 
      error: 'Payment verification failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get user subscription
router.get(
  "/subscription",
  authMiddleware,
  async (req, res) => {
    try {
      const subscription = await prismaClient.subscription.findFirst({
        where: {
          userId: req.userId!,
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          plan: true,
          createdAt: true,
        },
      });

      res.json({
        subscription: subscription || null,
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Error fetching subscription status" });
    }
  }
);

// Get user credits
router.get(
  "/credits",
  authMiddleware,
  async (req, res) => {
    try {
      if (!req.userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const userCredit = await prismaClient.userCredit.findUnique({
        where: {
          userId: req.userId,
        },
        select: {
          amount: true,
          updatedAt: true,
        },
      });

      res.json({
        credits: userCredit?.amount || 0,
        lastUpdated: userCredit?.updatedAt || null,
      });
    } catch (error) {
      console.error("Error fetching credits:", error);
      res.status(500).json({
        message: "Error fetching credits",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Get user transaction history
router.get(
  "/transactions",
  authMiddleware,
  async (req, res) => {
    try {
      const transactions = await prismaClient.transaction.findMany({
        where: {
          userId: req.userId!,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.status(200).json({
        transactions,
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({
        message: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Stripe webhook handler - uses raw body parsing
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!stripe) {
      res.status(400).send("Stripe is not configured");
      return;
    }
    
    const sig = req.headers["stripe-signature"];

    try {
      if (!sig) throw new Error("No Stripe signature found");
      if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("Stripe webhook secret not configured");

      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      console.log("Webhook event received:", event.type);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          const plan = session.metadata?.plan as PlanType;

          if (!userId || !plan) {
            throw new Error("Missing metadata in session");
          }

          console.log("Processing successful payment:", {
            userId,
            plan,
            sessionId: session.id,
          });

          await PaymentService.createSubscriptionRecord(
            userId,
            plan,
            session.payment_intent as string,
            session.id
          );

          console.log("Successfully processed payment and added credits");
          break;
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).send(
        `Webhook Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
);

export default router;
