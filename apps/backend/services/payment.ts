import { PrismaClient, PlanType, TransactionStatus } from "@prisma/client";
import crypto from "crypto";
import Razorpay from "razorpay";

const prisma = new PrismaClient();

// Validate environment variables
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.error("Missing Razorpay credentials");
}

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID!,
  key_secret: RAZORPAY_KEY_SECRET!,
});

// Define plan prices (in rupees)
export const PLAN_PRICES = {
  [PlanType.basic]: 4000, 
  [PlanType.premium]: 8000, 
} as const;

// Define credit amounts per plan
export const CREDITS_PER_PLAN = {
  [PlanType.basic]: 500,
  [PlanType.premium]: 1000,
} as const;

export async function createTransactionRecord(
  userId: string,
  amount: number,
  currency: string,
  paymentId: string,
  orderId: string,
  plan: PlanType,
  status: TransactionStatus = TransactionStatus.PENDING
) {
  try {
    return await prisma.transaction.create({
      data: {
        userId,
        amount,
        currency,
        paymentId,
        orderId,
        plan,
        status,
      },
    });
  } catch (error) {
    console.error("Transaction creation error:", error);
    throw error;
  }
}

export const createRazorpayOrder = async (userId: string, plan: PlanType, userEmail: string) => {
  const amount = getPlanAmount(plan);
  const order = await razorpay.orders.create({
    amount: amount * 100, // Convert to paise
    currency: "INR",
    receipt: `order_${Date.now()}`,
  });

  // Create transaction record
  const transaction = await createTransactionRecord(
    userId,
    amount,
    "INR",
    "", // paymentId will be updated when payment is successful
    order.id,
    plan,
    TransactionStatus.PENDING
  );

  return { order, transaction };
};

export const verifyRazorpaySignature = async (
  orderId: string,
  paymentId: string,
  signature: string
) => {
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (expectedSignature !== signature) {
    throw new Error("Invalid payment signature");
  }

  return true;
};

export const addCreditsForPlan = async (userId: string, plan: PlanType) => {
  const credits = getPlanCredits(plan);
  await prisma.userCredit.upsert({
    where: { userId },
    update: {
      amount: {
        increment: credits,
      },
    },
    create: {
      userId,
      amount: credits,
    },
  });
};

export const createSubscriptionRecord = async (
  userId: string,
  plan: PlanType,
  paymentId: string,
  orderId: string
) => {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      plan,
      paymentId,
      orderId,
    },
  });

  return subscription;
};

const getPlanAmount = (plan: PlanType): number => {
  switch (plan) {
    case PlanType.basic:
      return PLAN_PRICES[PlanType.basic];
    case PlanType.premium:
      return PLAN_PRICES[PlanType.premium];
    default:
      throw new Error("Invalid plan type");
  }
};

const getPlanCredits = (plan: PlanType): number => {
  switch (plan) {
    case PlanType.basic:
      return CREDITS_PER_PLAN[PlanType.basic];
    case PlanType.premium:
      return CREDITS_PER_PLAN[PlanType.premium];
    default:
      throw new Error("Invalid plan type");
  }
};

export enum PaymentService {
  RAZORPAY = "razorpay",
}
