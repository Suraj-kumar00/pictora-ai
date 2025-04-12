"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PaymentSuccessContent } from "@/components/payment/PaymentSuccessContent";

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        setError("No session ID provided");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/payment/verify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: sessionId,
              method: "stripe",
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Payment verification failed");
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "Payment verification failed");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    verifyPayment();
  }, [sessionId]);

  if (isLoading) {
    return <PaymentSuccessContent status="loading" />;
  }

  if (error) {
    return <PaymentSuccessContent status="error" error={error} />;
  }

  return <PaymentSuccessContent status="success" />;
}
