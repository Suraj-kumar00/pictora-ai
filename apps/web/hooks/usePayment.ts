import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/app/config";
import { RazorpayResponse } from "@/types";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!);
const apiUrl = BACKEND_URL;

// Create an event bus for credit updates
export const creditUpdateEvent = new EventTarget();

export function usePayment() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { getToken } = useAuth();

  const handlePayment = async (plan: any) => {
    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/payment/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan, method: "stripe" }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create payment session");
      }

      const { sessionId, url } = await response.json();

      if (url) {
        window.location.href = url;
      } else {
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error("Stripe failed to initialize");
        }

        const { error } = await stripe.redirectToCheckout({
          sessionId,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: "Payment Error",
        description: error instanceof Error ? error.message : "An error occurred during payment",
        variant: "destructive",
      });
      throw error;
    }
  };

  return { handlePayment };
}

// Helper function to load Razorpay SDK
function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve) => {
    if (document.getElementById("razorpay-sdk")) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    document.body.appendChild(script);
  });
}
