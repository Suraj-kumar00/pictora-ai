import { useState } from "react";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/app/config";
import { RazorpayResponse } from "@/types";
import { PlanType } from "@/types";

// Remove the loadStripe line that's causing the error
// const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!);
const apiUrl = BACKEND_URL;

// Create an event bus for credit updates
export const creditUpdateEvent = new EventTarget();

declare global {
  interface Window {
    Razorpay: any;
  }
}

export const usePayment = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { getToken } = useAuth();
  const router = useRouter();

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => {
        resolve(true);
      };
      script.onerror = () => {
        resolve(false);
      };
      document.body.appendChild(script);
    });
  };

  const handlePayment = async (plan: PlanType, isAnnual: boolean = false, method: string = "razorpay") => {
    try {
      setIsLoading(true);
      
      // Only process Razorpay payments
      if (method !== "razorpay") {
        alert("Only Razorpay payments are currently supported");
        setIsLoading(false);
        return;
      }
      
      // Load Razorpay script
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        alert("Failed to load Razorpay. Please check your internet connection.");
        setIsLoading(false);
        return;
      }

      // Get auth token
      const token = await getToken();
      if (!token) {
        alert("Authentication failed. Please log in again.");
        setIsLoading(false);
        return;
      }

      console.log("Creating Razorpay order...");
      console.log("Backend URL:", BACKEND_URL);
      
      try {
        // Create Razorpay order with detailed error handling
        const response = await axios.post(
          `${BACKEND_URL}/api/payments/razorpay/order`, 
          { plan },
          { 
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            } 
          }
        );
        
        console.log("Order created:", response.data);
        
        if (!response.data || !response.data.order_id) {
          console.error("Invalid order data received:", response.data);
          alert("Invalid order data received from server. Please try again.");
          setIsLoading(false);
          return;
        }
        
        // Configure Razorpay options
        const options = {
          key: response.data.key,
          amount: response.data.amount,
          currency: response.data.currency || "INR",
          name: "Pictora AI",
          description: response.data.description || `${plan.toUpperCase()} Plan - ${plan === PlanType.basic ? 500 : 1000} Credits`,
          order_id: response.data.order_id,
          handler: async function(response: any) {
            try {
              console.log("Payment successful:", response);
              
              // Verify payment on server
              const verifyResponse = await axios.post(
                `${BACKEND_URL}/api/payments/razorpay/verify`,
                {
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  plan
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );
              
              console.log("Payment verified:", verifyResponse.data);
              
              // Dispatch credit update event with the new credit value
              if (verifyResponse.data && verifyResponse.data.credits) {
                creditUpdateEvent.dispatchEvent(new CustomEvent('creditUpdate', {
                  detail: verifyResponse.data.credits
                }));
              }
              
              alert("Payment successful! Credits added to your account.");
              router.push('/dashboard');
            } catch (error) {
              console.error("Payment verification error:", error);
              alert("Payment completed but verification failed. Please contact support.");
              router.push('/dashboard'); // Still redirect to dashboard
            }
          },
          prefill: response.data.prefill || {
            name: "",
            email: "",
            contact: ""
          },
          notes: response.data.notes || {},
          theme: response.data.theme || {
            color: "#3399cc"
          },
          modal: {
            ondismiss: function() {
              console.log("Checkout form closed");
              setIsLoading(false);
              router.push('/pricing/cancel'); // Redirect to cancel page
            }
          }
        };
        
        // Initialize Razorpay
        const razorpay = new window.Razorpay(options);
        
        // Handle payment failures
        razorpay.on('payment.failed', function(failedResponse: any) {
          console.error("Payment failed:", failedResponse.error);
          alert(`Payment failed: ${failedResponse.error.description}`);
          setIsLoading(false);
          router.push('/pricing/cancel'); // Redirect to cancel page
        });
        
        // Open Razorpay checkout
        razorpay.open();
      } catch (apiError: any) {
        // Detailed API error logging
        console.error("API Error:", apiError);
        console.error("Error response:", apiError.response?.data);
        console.error("Error status:", apiError.response?.status);
        
        if (apiError.response?.status === 401 || apiError.response?.status === 403) {
          alert("Authentication failed. Please log in again.");
          router.push('/signin');
        } else {
          alert(`Payment initialization failed: ${apiError.response?.data?.message || apiError.message || "Unknown error"}`);
        }
        setIsLoading(false);
      }
    } catch (error: any) {
      console.error("Payment initialization error:", error);
      alert(`Failed to initialize payment: ${error.message}`);
      setIsLoading(false);
    }
  };

  return {
    handlePayment,
    isLoading
  };
};
