import express, { Request, Response, Router, RequestHandler } from "express";
import { authMiddleware } from "../middleware.js";
import { PlanType, TransactionStatus } from "@prisma/client";
import { prismaClient } from "db";
import * as PaymentService from "../services/payment.js";

const router: Router = express.Router();

function isValidPlanType(plan: string): plan is PlanType {
  return plan === "basic" || plan === "premium";
}

const createOrderHandler: RequestHandler = async (req, res) => {
  try {
    const { planType } = req.body;
    const userEmail = req.user?.email;
    const userId = req.userId;

    if (!userEmail || !userId) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (!isValidPlanType(planType)) {
      res.status(400).json({ error: "Invalid plan type" });
      return;
    }

    const { order, transaction } = await PaymentService.createRazorpayOrder(userId, planType, userEmail);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Error creating order" });
  }
};

const verifyPaymentHandler: RequestHandler = async (req, res) => {
  try {
    const { orderId, paymentId, signature } = req.body;
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await PaymentService.verifyRazorpaySignature(orderId, paymentId, signature);

    // Get transaction details
    const transaction = await prismaClient.transaction.findFirst({
      where: { orderId, userId },
    });

    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    // Update transaction status
    await prismaClient.transaction.update({
      where: { id: transaction.id },
      data: {
        status: TransactionStatus.SUCCESS,
        paymentId,
      },
    });

    // Create subscription record
    await PaymentService.createSubscriptionRecord(userId, transaction.plan, paymentId, orderId);

    // Add credits to user
    await PaymentService.addCreditsForPlan(userId, transaction.plan);

    res.json({ success: true });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: "Payment verification failed" });
  }
};

const getCreditsHandler: RequestHandler = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const userCredit = await prismaClient.userCredit.findUnique({
      where: { userId },
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
    res.status(500).json({ error: "Error fetching credits" });
  }
};

router.post("/create-order", authMiddleware, createOrderHandler);
router.post("/verify-payment", authMiddleware, verifyPaymentHandler);
router.get("/credits", authMiddleware, getCreditsHandler);

router.get("/subscription/:userId", authMiddleware, async (req: express.Request, res: express.Response) => {
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
    res.status(500).json({ error: "Error fetching subscription status" });
  }
});

router.get("/transactions", authMiddleware, async (req, res) => {
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
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

export default router; 