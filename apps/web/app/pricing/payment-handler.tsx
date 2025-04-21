import { useEffect } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export const usePayment = () => {
  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handlePayment = async (plan: 'basic' | 'premium') => {
    try {
      console.log("Initiating payment for plan:", plan);
      
      // Create order on server
      const response = await axios.post(`${BACKEND_URL}/api/payments/razorpay/order`, { 
        plan 
      }, {
        headers: {
          'Content-Type': 'application/json',
          // For development, use this header
          'Authorization': 'Bearer development-token'
        }
      });

      console.log("Order created successfully:", response.data);
      
      const options = {
        key: response.data.key,
        amount: response.data.amount,
        currency: response.data.currency,
        name: "Pictora AI",
        description: `${plan.toUpperCase()} Plan - ${plan === 'basic' ? 500 : 1000} Credits`,
        order_id: response.data.order_id,
        handler: async function(response: any) {
          console.log("Payment successful:", response);

          // Verify payment on server
          const verifyResponse = await axios.post(
            `${BACKEND_URL}/api/payments/razorpay/verify`,
            {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              plan
            },
            {
              headers: {
                'Content-Type': 'application/json',
                // For development, use this header
                'Authorization': 'Bearer development-token'
              }
            }
          );

          console.log("Payment verified:", verifyResponse.data);
          alert("Payment successful! Credits added to your account.");
          window.location.href = '/dashboard'; // Redirect to dashboard after payment
        },
        prefill: {
          name: "",
          email: "",
          contact: ""
        },
        theme: {
          color: "#3399cc"
        }
      };

      // Initialize and open Razorpay
      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', function(response: any) {
        console.error("Payment failed:", response.error);
        alert(`Payment failed: ${response.error.description}`);
      });
      
      razorpay.open();
    } catch (error) {
      console.error("Payment error:", error);
      alert("Could not initiate payment. Please try again later.");
    }
  };

  return { handlePayment };
}; 